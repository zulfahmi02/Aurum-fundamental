import { handler } from './handler.ts';
import { makeAutoReport, parseCalendar, readAutoReport } from '../../../src/automatic.ts';
import { SUPPORT_META } from '../../../src/automaticSupport.ts';
const supportFixture = (now: number) => ({ version: 1, checkedAt: now, series: SUPPORT_META.map(m => ({ id: m.id, fetchedAt: null, attemptedAt: now, points: [], error: 'Fixture unavailable' })) });

function check(value: unknown, message: string) { if (!value) throw new Error(message); }
Deno.test('worker authentication, throttling, immutable snapshots and upstream failure', async () => {
  const original = globalThis.fetch;
  const env = ['AURUM_CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const saved = env.map(k => Deno.env.get(k));
  Deno.env.set(env[0], 'test-only-secret-with-at-least-32-characters');
  Deno.env.set(env[1], 'https://example.invalid'); Deno.env.set(env[2], 'test-only-key');
  let calls = 0, releases = 0, calendars = 0, macroCalls = 0, failCalendar = false, failContextWrite = false, acquired = true;
  let cached: Record<string, unknown> | null = null;
  const snapshots = new Map<string, unknown>();
  const contextHistory: unknown[] = [];
  const release = new Date(Date.now() + 3600000).toISOString().replace('.000Z', 'Z').replace(/\.\d{3}Z$/, 'Z');
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls++; const url = String(input);
    if (url.includes('ff_calendar')) {
      calendars++;
      return failCalendar ? new Response('Limited', { status: 429 }) : Response.json([{ country: 'USD', title: 'PPI m/m', date: release, forecast: '0.2%', previous: '0.3%' }]);
    }
    if (url.includes('api.bls.gov')) { macroCalls++; return new Response('Unavailable', { status: 503 }); }
    if (url.includes('federalreserve.gov') || url.includes('fred.stlouisfed.org') || url.includes('adpemploymentreport.com')) return new Response('Unavailable', { status: 503 });
    if (url.endsWith('rpc/aurum_auto_acquire')) return Response.json(acquired);
    if (url.includes('aurum_auto_locks')) { check(init?.method === 'PATCH', 'Lease is only released, never created here'); releases++; return new Response(null, { status: 204 }); }
    if (url.includes('aurum_auto_calendar')) {
      if (init?.method === 'POST') { cached = JSON.parse(String(init.body)); return new Response(null, { status: 204 }); }
      return Response.json(cached ? [cached] : []);
    }
    if (url.includes('aurum_auto_reports') && init?.method === 'POST') {
      check((init.headers as Record<string, string>).Prefer.includes('ignore-duplicates'), 'Must not overwrite snapshots');
      for (const row of JSON.parse(String(init.body))) if (!snapshots.has(row.id)) snapshots.set(row.id, row);
      return new Response(null, { status: 204 });
    }
    if (url.includes('aurum_auto_reports')) return Response.json([...snapshots.values()]);
    if (url.includes('aurum_auto_outcomes')) return Response.json([]);
    if (url.includes('aurum_auto_context_history')) {
      if (failContextWrite) return new Response('Write failed', { status: 500 });
      contextHistory.push(JSON.parse(String(init?.body))); return new Response(null, { status: 204 });
    }
    throw new Error('Unexpected network target');
  }) as typeof fetch;
  const request = () => new Request('https://example.invalid/worker', { method: 'POST', headers: { 'x-aurum-secret': Deno.env.get(env[0])! } });
  try {
    check((await handler(new Request('https://example.invalid/worker'))).status === 401, 'Reject anonymous request');
    check(calls === 0, 'Unauthorized request cannot access upstream/database');
    check((await handler(request())).status === 200, 'Worker completes despite BLS failure');
    check(releases === 1, 'Lease released after a completed run');
    check(snapshots.size === 1 && calendars === 1 && macroCalls === 1, 'One report and one request per provider');
    check(contextHistory.length === 1, 'Archive the observed support version even when providers fail');
    const before = JSON.stringify([...snapshots]);
    await handler(request());
    check(calendars === 1 && macroCalls === 1, 'Provider requests throttled across invocations');
    check(contextHistory.length === 1, 'Fresh cache does not create fake new vintages');
    check(JSON.stringify([...snapshots]) === before, 'Retry preserves original snapshot');
    const row = cached as unknown as { payload: { fetchedAt: number }; attempted_at: string; error: string };
    row.payload.fetchedAt = Date.now() - 3 * 3600000;
    row.attempted_at = new Date(Date.now() - 3600000).toISOString();
    failCalendar = true;
    await handler(request());
    check((cached as unknown as { error: string }).error.includes('429'), 'Record provider failure');
    check(JSON.stringify([...snapshots]) === before, 'Upstream failure cannot rewrite stored analysis');
    const contextRow = cached as unknown as { support: { checkedAt: number; series: { attemptedAt: number }[] } };
    contextRow.support.checkedAt = Date.now() - 2 * 3600000;
    contextRow.support.series.forEach(r => { r.attemptedAt = contextRow.support.checkedAt; });
    const oldCache = JSON.stringify(cached); failContextWrite = true;
    const released = releases;
    check((await handler(request())).status === 500, 'Context history write failure must fail worker');
    check(releases === released + 1, 'Lease released after a failed run');
    check(JSON.stringify(cached) === oldCache, 'Failed history archive cannot publish a healthy cache heartbeat');
    const count = calls; acquired = false;
    check((await (await handler(request())).json()).status === 'already-running', 'Lease prevents overlapping workers');
    check(calls === count + 1, 'No provider requests without lease');
    check(releases === released + 1, 'A run that did not get the lease must not release it');
  } finally {
    globalThis.fetch = original;
    env.forEach((k, i) => saved[i] === undefined ? Deno.env.delete(k) : Deno.env.set(k, saved[i]!));
  }
});

Deno.test('worker publishes a reproducible experimental PPI bias and never rewrites it', async () => {
  const original = globalThis.fetch;
  const env = ['AURUM_CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const saved = env.map(k => Deno.env.get(k));
  Deno.env.set(env[0], 'test-only-secret-with-at-least-32-characters');
  Deno.env.set(env[1], 'https://example.invalid'); Deno.env.set(env[2], 'test-only-key');
  const now = Date.now(), release = Math.floor((now + 3600000) / 1000) * 1000;
  const date = new Date(release); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 2);
  const period = date.toISOString().slice(0, 7);
  let cached = {
    support: supportFixture(now),
    payload: parseCalendar(['PPI m/m', 'Core PPI m/m'].map(title => ({ country: 'USD', title, date: new Date(release).toISOString().replace('.000Z', 'Z'), forecast: '0.3%', previous: '0.1%' })), now),
    macro: { fetchedAt: now, observations: [
      { id: 'WPSFD4', label: 'PPI headline m/m', unit: '%', period, value: 0.1 },
      { id: 'WPSFD49104', label: 'PPI tanpa makanan/energi m/m', unit: '%', period, value: 0.1 },
    ], missing: [] },
    attempted_at: new Date(now).toISOString(), macro_attempted_at: new Date(now).toISOString(), fed_attempted_at: new Date(now).toISOString(),
  };
  const snapshots = new Map<string, { payload: unknown }>();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('rpc/aurum_auto_acquire')) return Response.json(true);
    if (url.includes('aurum_auto_locks')) return new Response(null, { status: 204 });
    if (url.includes('aurum_auto_calendar')) {
      if (init?.method === 'POST') { cached = JSON.parse(String(init.body)); return new Response(null, { status: 204 }); }
      return Response.json([cached]);
    }
    if (url.includes('aurum_auto_reports')) {
      if (init?.method === 'POST') {
        for (const row of JSON.parse(String(init.body))) {
          check(readAutoReport(row.payload).bias === 'BUY', 'Stored bias reproducible from its own snapshot');
          if (!snapshots.has(row.id)) snapshots.set(row.id, row);
        }
        return new Response(null, { status: 204 });
      }
      return Response.json([...snapshots.values()]);
    }
    if (url.includes('aurum_auto_outcomes')) return Response.json([]);
    throw new Error('Fresh cache should not request upstream data');
  }) as typeof fetch;
  try {
    const request = () => new Request('https://example.invalid/worker', { method: 'POST', headers: { 'x-aurum-secret': Deno.env.get(env[0])! } });
    snapshots.set('legacy', { payload: { version: 1, id: 'legacy', note: 'unreadable archived row' } });
    check((await handler(request())).status === 200, 'Unreadable archived report does not stop the worker');
    check(snapshots.size === 2, 'Exactly one current stage published next to the untouched archive row');
    const frozen = JSON.stringify([...snapshots]);
    check((await handler(request())).status === 200, 'Retry succeeds with directional snapshot validation');
    check(JSON.stringify([...snapshots]) === frozen, 'Direction/reasons/timestamp immutable on retry');
  } finally {
    globalThis.fetch = original;
    env.forEach((k, i) => saved[i] === undefined ? Deno.env.delete(k) : Deno.env.set(k, saved[i]!));
  }
});

Deno.test('worker records a later BLS period separately without changing preparation or certifying first release', async () => {
  const original = globalThis.fetch;
  const env = ['AURUM_CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const saved = env.map(k => Deno.env.get(k));
  Deno.env.set(env[0], 'test-only-secret-with-at-least-32-characters');
  Deno.env.set(env[1], 'https://example.invalid'); Deno.env.set(env[2], 'test-only-key');
  const now = Date.now(), release = Math.floor((now - 3600000) / 1000) * 1000, prep = release - 600000;
  const target = new Date(now); target.setUTCDate(1); target.setUTCMonth(target.getUTCMonth() - 1);
  const period = target.toISOString().slice(0, 7);
  const previous = new Date(`${period}-01T00:00:00Z`); previous.setUTCMonth(previous.getUTCMonth() - 1);
  const raw = [{ country: 'USD', title: 'PPI m/m', date: new Date(release).toISOString().replace('.000Z', 'Z'), forecast: '0.2%', previous: '0.3%' }];
  const before = { fetchedAt: prep, observations: [{ id: 'WPSFD4', label: 'PPI headline m/m', period: previous.toISOString().slice(0, 7), value: 0.3, unit: '%' }], missing: [] };
  const report = makeAutoReport(parseCalendar(raw, prep).events[0], prep, prep, 'server', before)!;
  const frozen = JSON.stringify(report);
  const after = { ...before, fetchedAt: now, observations: [{ ...before.observations[0], period, value: 0.4 }] };
  let cached = { support: supportFixture(now), payload: parseCalendar(raw, now), macro: after, macro_attempted_at: new Date(now).toISOString(), attempted_at: new Date(now).toISOString(),
    fed_attempted_at: new Date(now).toISOString(), error: null, macro_error: null, release_attempts: {} };
  const outcomes: { id: string; event_id: string; payload: { quality: string; value: number } }[] = [];
  let failOutcomeWrite = true;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('rpc/aurum_auto_acquire')) return Response.json(true);
    if (url.includes('aurum_auto_locks')) return new Response(null, { status: 204 });
    if (url.includes('aurum_auto_calendar')) {
      if (init?.method === 'POST') { cached = JSON.parse(String(init.body)); return new Response(null, { status: 204 }); }
      return Response.json([cached]);
    }
    if (url.includes('aurum_auto_reports')) {
      check(init?.method === 'GET', 'Cannot publish a new preparation after cutoff');
      return Response.json([{ payload: report }]);
    }
    if (url.includes('aurum_auto_outcomes')) {
      if (init?.method === 'POST' && failOutcomeWrite) return new Response('Write failed', { status: 500 });
      if (init?.method === 'POST') { outcomes.push(...JSON.parse(String(init.body))); return new Response(null, { status: 204 }); }
      return Response.json(outcomes);
    }
    throw new Error('Fresh cache should not request upstream data');
  }) as typeof fetch;
  const request = () => new Request('https://example.invalid/worker', { method: 'POST', headers: { 'x-aurum-secret': Deno.env.get(env[0])! } });
  try {
    const oldCache = JSON.stringify(cached);
    check((await handler(request())).status === 500, 'Result storage failure must fail worker');
    check(JSON.stringify(cached) === oldCache, 'Failed writes cannot publish a fresh healthy heartbeat');
    failOutcomeWrite = false;
    check((await handler(request())).status === 200, 'Post-release worker succeeds');
    check(outcomes.length === 1 && outcomes[0].payload.quality === 'post-release-observation', 'Never certify revised API data as first release');
    check(outcomes[0].payload.value === 0.4, 'Store observed value');
    await handler(request());
    check(outcomes.length === 1, 'Already observed event is not recorded twice');
    check(JSON.stringify(report) === frozen, 'Preparation stays immutable');
  } finally {
    globalThis.fetch = original;
    env.forEach((k, i) => saved[i] === undefined ? Deno.env.delete(k) : Deno.env.set(k, saved[i]!));
  }
});
