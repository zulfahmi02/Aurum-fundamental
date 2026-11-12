import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).flatMap(line => {
  const m = line.match(/^(EXPO_PUBLIC_SUPABASE_[A-Z_]+)\s*=\s*(.*?)\s*$/);
  return m ? [[m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
}));
const url = env.EXPO_PUBLIC_SUPABASE_URL, key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (url !== 'https://silaakpxbykwoguiajdb.supabase.co' || !key) throw new Error('Expected project configuration unavailable.');
const get = (path, options = {}) => fetch(url + path, { ...options, headers: { apikey: key, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) });
async function main() {
  const response = await get('/rest/v1/aurum_auto_calendar?id=eq.weekly&select=checked_at,error,payload,macro,macro_error,fed,support');
  if (!response.ok) throw new Error(`Calendar read HTTP ${response.status}`);
  const [row] = await response.json();
  if (!row?.payload?.events || !row.checked_at) throw new Error('Worker has not populated calendar.');
  console.log(JSON.stringify({ checkedAt: row.checked_at, calendarFetchedAt: new Date(row.payload.fetchedAt).toISOString(),
    events: row.payload.events.map(e => ({ kind: e.kind, release: new Date(e.release).toISOString() })),
    macroSeries: row.macro?.observations?.length ?? 0, providerError: row.error, macroError: row.macro_error,
    fedMeetings: row.fed?.calendar?.meetings?.length ?? 0, fedRatesDate: row.fed?.rates?.period ?? null, fedErrors: row.fed?.errors ?? [],
    supportSeries: row.support?.series?.filter(s => s.fetchedAt).length ?? 0, supportErrors: row.support?.series?.filter(s => s.error).map(s => ({ id: s.id, error: s.error })) ?? [] }, null, 2));
  for (const table of ['aurum_auto_calendar', 'aurum_auto_reports', 'aurum_auto_outcomes', 'aurum_auto_context_history', 'aurum_auto_prices']) {
    // Empty payload cannot create a row even if privileges are accidentally permissive.
    const denied = await get(`/rest/v1/${table}`, { method: 'POST', body: '{}' });
    const result = await denied.json();
    if (result.code !== '42501') throw new Error(`${table}: anonymous write was not denied by privileges`);
  }
  const functionResponse = await get('/functions/v1/auto-reports', { method: 'POST', body: '{}' });
  if (functionResponse.status !== 401) throw new Error('Worker did not reject missing cron credential.');
  const priceFunction = await get('/functions/v1/price-ticks', { method: 'POST', body: '{}' });
  if (priceFunction.status !== 401) throw new Error('Price worker did not reject missing cron credential.');
  const prices = await get('/rest/v1/aurum_auto_prices?select=id&limit=1');
  if (!prices.ok) throw new Error('Public price read failed.');
  const bridge = await get('/rest/v1/rpc/aurum_auto_bootstrap_secret', { method: 'POST', body: '{}' });
  if (bridge.status !== 404) throw new Error('Temporary deployment credential bridge has not been removed.');
  const reports = await get('/rest/v1/aurum_auto_reports?select=id&limit=1');
  if (!reports.ok) throw new Error('Public report read failed.');
  const outcomes = await get('/rest/v1/aurum_auto_outcomes?select=id&limit=1');
  if (!outcomes.ok) throw new Error('Public outcomes read failed.');
  const contextHistory = await get('/rest/v1/aurum_auto_context_history?select=id&limit=1');
  if (!contextHistory.ok) throw new Error('Public context history read failed.');
  console.log('OK: public economic reads, denied anonymous writes, protected worker, bootstrap bridge removed.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
