import { fetchCalendar, makeAutoReport, readAutoReport, readCalendar, type Calendar } from '../../../src/automatic.ts';
import { fetchMacro, needsMacroUpgrade, readMacro, type Macro } from '../../../src/automaticMacro.ts';
import { fetchFedContext, fetchFedDecision, readFedContext, type FedContext } from '../../../src/automaticFed.ts';
import { latestPreparation, matchFedDecision, observeBlsRelease, type AutoOutcome } from '../../../src/automaticOutcomes.ts';
import { fetchSupport, readSupport, type Support } from '../../../src/automaticSupport.ts';

// Cron secret is server-only; JWT verification is disabled only for this cron endpoint.
// No request parameters control URLs, queries, secrets, event data or timestamps.
export async function handler(request: Request) {
  const secret = Deno.env.get('AURUM_CRON_SECRET');
  if (!secret || secret.length < 32) return new Response('Worker not configured', { status: 503 });
  if (request.method !== 'POST' || request.headers.get('x-aurum-secret') !== secret) return new Response('Unauthorized', { status: 401 });
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return new Response('Worker not configured', { status: 503 });
  async function db(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<unknown> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${url}/rest/v1/${path}`, { method, signal: controller.signal,
        headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (!response.ok) throw new Error(`Database HTTP ${response.status}`);
      const raw = await response.text(); return raw ? JSON.parse(raw) : null;
    } finally { clearTimeout(timer); }
  }
  try {
    if (!await db('rpc/aurum_auto_acquire', 'POST', {})) return Response.json({ status: 'already-running' });
    const rows = await db('aurum_auto_calendar?id=eq.weekly&select=payload,macro,macro_attempted_at,attempted_at,error,fed,fed_attempted_at,macro_error,release_attempts,support') as {
      payload: unknown; macro: unknown; macro_attempted_at: string | null; attempted_at: string | null; error: string | null;
      fed: unknown; fed_attempted_at: string | null; macro_error: string | null; release_attempts: Record<string, string> | null;
      support?: unknown;
    }[];
    const cached = rows[0];
    let calendar: Calendar | null = null;
    try { if (cached?.payload) calendar = readCalendar(cached.payload); } catch { /* Refetch invalid disposable cache. */ }
    let error = cached?.error ?? null;
    let attempted = cached?.attempted_at ?? null;
    const now = Date.now();
    let support: Support | null = null, refreshedSupport = false;
    try { if (cached?.support) support = readSupport(cached.support); } catch { /* Recover disposable cache. */ }
    if (support && support.checkedAt > now) support = null;
    if (!support || now - support.checkedAt >= (support.series.some(s => s.error) ? 3600000 : 4 * 3600000)) {
      support = await fetchSupport(support); refreshedSupport = true;
    }
    if (calendar && calendar.fetchedAt > now) calendar = null;
    let macro: Macro | null = null, macroAttempted = cached?.macro_attempted_at ?? null;
    try { if (cached?.macro) macro = readMacro(cached.macro); } catch { /* Recover disposable context cache. */ }
    if (macro && macro.fetchedAt > now) macro = null;
    let fed: FedContext | null = null, fedAttempted = cached?.fed_attempted_at ?? null, macroError = cached?.macro_error ?? null;
    try { if (cached?.fed) fed = readFedContext(cached.fed); } catch { /* Fetch again when cached structure changes. */ }
    const elapsed = (at: string | null, duration: number) => !at || !Number.isFinite(Date.parse(at)) || Date.parse(at) > now || now - Date.parse(at) >= duration;
    // One calendar request/hour, with a 15-minute backoff after failure.
    if ((!calendar || now - calendar.fetchedAt >= 3600000) && elapsed(attempted, 15 * 60000)) {
      attempted = new Date(now).toISOString();
      try { calendar = await fetchCalendar(); error = null; }
      catch (e) { error = e instanceof Error ? e.message.slice(0, 300) : 'Calendar unavailable'; }
    }
    if ((!macro || needsMacroUpgrade(macro) || now - macro.fetchedAt >= 4 * 3600000) && elapsed(macroAttempted, 3600000)) {
      macroAttempted = new Date().toISOString();
      try { macro = await fetchMacro(); macroError = null; }
      catch { macroError = 'Konteks BLS belum dapat diperbarui.'; }
    }
    if (elapsed(fedAttempted, 3600000)) {
      fedAttempted = new Date().toISOString();
      fed = await fetchFedContext(fed);
    }
    const after = new Date(now - 7 * 86400000).toISOString();
    const [savedReports, savedOutcomes] = await Promise.all([
      db(`aurum_auto_reports?select=payload&generated_at=gte.${encodeURIComponent(after)}&order=generated_at.desc&limit=200`) as Promise<{ payload: unknown }[]>,
      db(`aurum_auto_outcomes?select=event_id&captured_at=gte.${encodeURIComponent(after)}&limit=200`) as Promise<{ event_id: string }[]>,
    ]);
    const settled = new Set(savedOutcomes.map(o => o.event_id));
    const preparations = latestPreparation(savedReports.map(r => readAutoReport(r.payload)));
    const attempts: Record<string, string> = {};
    const outcomes: AutoOutcome[] = [];
    for (const report of preparations) {
      if (now < report.event.release || now > report.event.release + 72 * 3600000 || settled.has(report.event.id)) continue;
      if (report.event.kind !== 'FOMC') {
        const result = macro ? observeBlsRelease(report, macro, Date.now()) : null;
        if (result) outcomes.push(result);
      } else {
        const attemptedAt = cached?.release_attempts?.[report.event.id] ?? null;
        if (attemptedAt) attempts[report.event.id] = attemptedAt;
        if (!elapsed(attemptedAt, 3600000)) continue;
        attempts[report.event.id] = new Date().toISOString();
        try {
          const result = matchFedDecision(report, await fetchFedDecision(report.event.release), Date.now());
          if (result) outcomes.push(result);
        } catch { /* Missing/mismatched official statement is retried; no invented actual. */ }
      }
    }
    const generatedAt = Date.now();
    const reports = calendar?.events.flatMap(event => {
      const report = makeAutoReport(event, calendar.fetchedAt, generatedAt, 'server', macro, fed, support);
      return report ? [{ id: report.id, event_id: event.id, generated_at: new Date(report.generatedAt).toISOString(), payload: report }] : [];
    }) ?? [];
    // Ignore duplicates: a retry never rewrites a previously published snapshot.
    if (reports.length) await db('aurum_auto_reports?on_conflict=id', 'POST', reports, 'resolution=ignore-duplicates,return=minimal');
    if (outcomes.length) await db('aurum_auto_outcomes?on_conflict=id', 'POST', outcomes.map(o => ({ id: o.id, event_id: o.eventId, captured_at: new Date(o.capturedAt).toISOString(), payload: o })), 'resolution=ignore-duplicates,return=minimal');
    if (refreshedSupport && support) await db('aurum_auto_context_history?on_conflict=id', 'POST', {
      id: `support-${support.checkedAt}`, captured_at: new Date(support.checkedAt).toISOString(), payload: support,
    }, 'resolution=ignore-duplicates,return=minimal');
    // Publish a fresh heartbeat only after all report/result writes have succeeded.
    await db('aurum_auto_calendar?on_conflict=id', 'POST', {
      id: 'weekly', payload: calendar, macro, macro_attempted_at: macroAttempted, checked_at: new Date().toISOString(), attempted_at: attempted, error,
      fed, fed_attempted_at: fedAttempted, macro_error: macroError, release_attempts: attempts,
      support,
    }, 'resolution=merge-duplicates,return=minimal');
    return Response.json({ status: error || macroError || fed?.errors.length || support?.series.some(s => s.error) ? 'degraded' : 'ok', candidates: reports.length, outcomes: outcomes.length, calendarFetchedAt: calendar?.fetchedAt ?? null });
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'Worker failure');
    return new Response('Worker failed; inspect function logs', { status: 500 });
  }
}
