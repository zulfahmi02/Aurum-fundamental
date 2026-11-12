import { readCalendar } from '../../../src/automatic.ts';
import { dueLegs, fetchQuote, makePriceTick } from '../../../src/automaticPrices.ts';

// Called every minute by cron. Records one indicative XAUUSD bid/ask at T−5 minutes and
// T+1 minute of each calendar event. Live quotes cannot be fetched later, so a missed
// minute stays missing. No request parameter controls URLs, events or timestamps.
export async function handler(request: Request) {
  const secret = Deno.env.get('AURUM_CRON_SECRET');
  if (!secret || secret.length < 32) return new Response('Worker not configured', { status: 503 });
  if (request.method !== 'POST' || request.headers.get('x-aurum-secret') !== secret) return new Response('Unauthorized', { status: 401 });
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return new Response('Worker not configured', { status: 503 });
  async function db(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<unknown> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${url}/rest/v1/${path}`, { method, signal: controller.signal,
        headers: { apikey: key!, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (!response.ok) throw new Error(`Database HTTP ${response.status}`);
      const raw = await response.text(); return raw ? JSON.parse(raw) : null;
    } finally { clearTimeout(timer); }
  }
  try {
    const rows = await db('aurum_auto_calendar?id=eq.weekly&select=payload') as { payload: unknown }[];
    if (!rows[0]?.payload) return Response.json({ status: 'idle', recorded: 0 });
    const events = readCalendar(rows[0].payload).events;
    if (!dueLegs(events, Date.now()).length) return Response.json({ status: 'idle', recorded: 0 });
    let quote;
    try { quote = await fetchQuote(); }
    catch {
      // One quick retry; the capture window is only seconds wide.
      await new Promise(resolve => setTimeout(resolve, 1500));
      quote = await fetchQuote();
    }
    const capturedAt = Date.now();
    // Re-evaluate after the request: a slow response may have left the window.
    const ticks = dueLegs(events, capturedAt).map(({ event, leg }) => makePriceTick(event, leg, quote, capturedAt));
    if (!ticks.length) return Response.json({ status: 'late', recorded: 0 });
    // Ignore duplicates: the first recorded quote of a leg is never replaced.
    await db('aurum_auto_prices?on_conflict=id', 'POST', ticks.map(t => ({ id: t.id, event_id: t.eventId, captured_at: new Date(t.capturedAt).toISOString(), payload: t })), 'resolution=ignore-duplicates,return=minimal');
    return Response.json({ status: 'ok', recorded: ticks.length });
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'Price worker failure');
    return new Response('Price worker failed; inspect function logs', { status: 500 });
  }
}
