import { handler } from './handler.ts';
import { parseCalendar } from '../../../src/automatic.ts';
import { readPriceTick } from '../../../src/automaticPrices.ts';

function check(value: unknown, message: string) { if (!value) throw new Error(message); }
const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
const minute = (t: number) => Math.floor(t / 60000) * 60000;

Deno.test('price worker: auth, idle outside targets, one immutable quote per leg, fail closed', async () => {
  const original = globalThis.fetch;
  const env = ['AURUM_CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const saved = env.map(k => Deno.env.get(k));
  Deno.env.set(env[0], 'test-only-secret-with-at-least-32-characters');
  Deno.env.set(env[1], 'https://example.invalid'); Deno.env.set(env[2], 'test-only-key');
  let calls = 0, quotes = 0, release = 0, stale = false, failQuotes = 0, bid = 3974.5;
  const stored = new Map<string, { payload: unknown }>();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls++; const url = String(input);
    if (url.includes('swissquote')) {
      quotes++;
      if (failQuotes-- > 0) return new Response('Unavailable', { status: 503 });
      return Response.json([{ topo: { platform: 'SwissquoteLtd', server: 'Live5' }, ts: Date.now() - (stale ? 120000 : 200),
        spreadProfilePrices: [{ spreadProfile: 'premium', bid, ask: bid + 0.6 }] }]);
    }
    if (url.includes('aurum_auto_calendar')) return Response.json(release ? [{ payload: parseCalendar([{ country: 'USD', title: 'PPI m/m', date: iso(release), forecast: '0.2%', previous: '0.3%' }], Date.now() - 1000) }] : []);
    if (url.includes('aurum_auto_prices') && init?.method === 'POST') {
      check((init.headers as Record<string, string>).Prefer.includes('ignore-duplicates'), 'Must not overwrite a recorded quote');
      for (const row of JSON.parse(String(init.body))) if (!stored.has(row.id)) stored.set(row.id, row);
      return new Response(null, { status: 204 });
    }
    throw new Error('Unexpected network target');
  }) as typeof fetch;
  const request = () => new Request('https://example.invalid/worker', { method: 'POST', headers: { 'x-aurum-secret': Deno.env.get(env[0])! } });
  const run = async () => { const response = await handler(request()); return { status: response.status, body: response.status === 200 ? await response.json() : null }; };
  try {
    check((await handler(new Request('https://example.invalid/worker', { method: 'POST' }))).status === 401, 'Reject anonymous request');
    check(calls === 0, 'Unauthorized request cannot access upstream/database');
    check((await run()).body.status === 'idle' && quotes === 0, 'No calendar: no quote request');
    release = minute(Date.now()) + 3600000;
    check((await run()).body.status === 'idle' && quotes === 0, 'Event an hour away: no quote request');
    // Now is a few seconds after T−5 minutes.
    release = Date.now() - 3000 + 5 * 60000; release -= release % 1000;
    const first = await run();
    check(first.body.status === 'ok' && first.body.recorded === 1 && stored.size === 1, 'Record the entry quote');
    const tick = readPriceTick([...stored.values()][0].payload);
    check(tick.leg === 'entry' && tick.bid === 3974.5 && tick.target === release - 5 * 60000, 'Entry quote is valid and on target');
    bid = 4000; await run();
    check(readPriceTick([...stored.values()][0].payload).bid === 3974.5, 'Retry never replaces the first quote');
    // A few seconds after T+1 minute.
    release = Date.now() - 2000 - 60000; release -= release % 1000;
    failQuotes = 1; const before = quotes;
    const exit = await run();
    check(exit.body.status === 'ok' && quotes === before + 2 && stored.size === 2, 'One retry after a provider failure');
    check(readPriceTick([...stored.values()][1].payload).leg === 'exit', 'Record the exit quote');
    release = Date.now() - 4000 - 60000; release -= release % 1000; stale = true;
    const size = stored.size;
    check((await run()).status === 500 && stored.size === size, 'Stale quote is rejected, nothing stored');
  } finally {
    globalThis.fetch = original;
    env.forEach((k, i) => saved[i] === undefined ? Deno.env.delete(k) : Deno.env.set(k, saved[i]!));
  }
});
