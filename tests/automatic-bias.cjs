const assert = require('node:assert/strict');
const { parseCalendar, makeAutoReport, readAutoReport } = require('../.test-build/automatic.js');
const { analyzeBias } = require('../.test-build/automaticBias.js');
const { parseMacro, needsCorePpi } = require('../.test-build/automaticMacro.js');
const at = Date.parse('2026-11-13T08:30Z'), release = Date.parse('2026-11-13T13:30Z');
const defs = [
  ['CES0000000001', 'Pertumbuhan payroll', 'ribu pekerjaan'],
  ['LNS14000000', 'Pengangguran', '%'],
  ['CES0500000003', 'Upah per jam m/m', '%'],
  ['CUSR0000SA0', 'CPI headline m/m', '%'],
  ['CUSR0000SA0L1E', 'CPI tanpa makanan/energi m/m', '%'],
  ['WPSFD4', 'PPI headline m/m', '%'],
  ['WPSFD49104', 'PPI tanpa makanan/energi m/m', '%'],
];
const macro = (values, period = '2026-09') => ({ fetchedAt: at, missing: [], observations: defs.map(([id, label, unit], i) => ({ id, label, unit, period, value: values[i] })) });
const events = Object.fromEntries(Object.entries({
  NFP: [['Non-Farm Employment Change', '150K'], ['Unemployment Rate', '4%'], ['Average Hourly Earnings m/m', '0.3%']],
  CPI: [['CPI m/m', '0.3%'], ['Core CPI m/m', '0.3%']],
  PPI: [['PPI m/m', '0.3%'], ['Core PPI m/m', '0.3%']],
  FOMC: [['Federal Funds Rate', '4%']],
}).map(([kind, items]) => [kind, parseCalendar(items.map(([title, forecast]) => ({ country: 'USD', title, forecast, previous: '999%', date: '2026-11-13T08:30:00-05:00' })), at).events[0]]));
const fed = { version: 1, calendar: { fetchedAt: at, meetings: [{ date: '2026-11-13', projections: false }] }, rates: { fetchedAt: at, period: '2026-11-12', lower: 3.75, upper: 4 }, errors: [] };
const soft = macro([50, 4.2, 0.1, 0.1, 0.1, 0.1, 0.1]);
const firm = macro([250, 3.8, 0.5, 0.5, 0.5, 0.5, 0.5]);
const middle = macro([150, 4, 0.25, 0.25, 0.25, 0.25, 0.25]);
for (const [kind, event] of Object.entries(events)) {
  for (const [data, expected] of [[soft, 'BUY'], [firm, 'SELL'], [middle, 'NEUTRAL']]) {
    const report = makeAutoReport(event, at, at, 'server', data, fed);
    assert.equal(report.bias, expected, kind);
    assert.equal(report.analysis.experimental, true);
    assert.deepEqual(readAutoReport(JSON.parse(JSON.stringify(report))), report);
    assert.equal(report.analysis.confidence, undefined);
    const corrupt = structuredClone(report); corrupt.bias = expected === 'BUY' ? 'SELL' : 'BUY';
    assert.throws(() => readAutoReport(corrupt));
    const changed = structuredClone(report); changed.analysis.reasons[0] = 'Guaranteed correct';
    assert.throws(() => readAutoReport(changed));
    const stripped = structuredClone(report); delete stripped.analysis;
    assert.throws(() => readAutoReport(stripped));
  }
  assert.equal(makeAutoReport(event, at, at, 'server', null, fed).bias, 'NO_SIGNAL');
  assert.equal(makeAutoReport(event, at - 2 * 3600000 - 1, at, 'server', soft, fed).bias, 'NO_SIGNAL');
  assert.equal(makeAutoReport(event, at, at, 'server', { ...soft, fetchedAt: at - 6 * 3600000 - 1 }, fed).bias, 'NO_SIGNAL');
  assert.equal(makeAutoReport(event, at, at, 'server', { ...soft, fetchedAt: at + 1 }, fed).bias, 'NO_SIGNAL');
  assert.equal(makeAutoReport(event, at, release - 5 * 60000 + 1, 'server', soft, fed), null);
  assert.equal(analyzeBias(event, at, release, soft, fed).bias, 'NO_SIGNAL');
  assert.equal(makeAutoReport(event, at, at, 'server', macro([50, 4.2, 0.1, 0.1, 0.1, 0.1, 0.1], '2026-11'), fed).bias, 'NO_SIGNAL');
  assert.equal(makeAutoReport(event, at, at, 'server', macro([50, 4.2, 0.1, 0.1, 0.1, 0.1, 0.1], '2026-07'), fed).bias, 'NO_SIGNAL');
  const frozen = makeAutoReport(event, at, at, 'server', structuredClone(soft), fed);
  const copy = JSON.stringify(frozen);
  const later = structuredClone(soft); later.observations.forEach(o => o.value += 10);
  makeAutoReport(event, at, at, 'server', later, fed);
  assert.equal(JSON.stringify(frozen), copy);
}
for (const [kind, id] of [['NFP', 'LNS14000000'], ['CPI', 'CUSR0000SA0L1E'], ['PPI', 'WPSFD49104'], ['FOMC', 'CES0500000003']]) {
  const partial = structuredClone(soft); partial.observations = partial.observations.filter(o => o.id !== id);
  assert.equal(makeAutoReport(events[kind], at, at, 'server', partial, fed).bias, 'NO_SIGNAL');
}
// Conflict veto, including inverse unemployment. A rate cut consensus alone cannot flip FOMC.
for (const [kind, index] of [['NFP', 1], ['CPI', 4], ['PPI', 6], ['FOMC', 2]]) {
  const mixed = structuredClone(soft); mixed.observations[index].value = firm.observations[index].value;
  assert.equal(makeAutoReport(events[kind], at, at, 'server', mixed, fed).bias, 'NEUTRAL');
}
const cut = structuredClone(events.FOMC); cut.items[0].forecast = '3.75%';
assert.equal(makeAutoReport(cut, at, at, 'server', firm, fed).bias, 'SELL');
assert.equal(makeAutoReport(events.FOMC, at, at, 'server', soft).bias, 'NO_SIGNAL');
for (const modified of [
  { ...fed, calendar: { ...fed.calendar, meetings: [{ date: '2026-12-09', projections: true }] } },
  { ...fed, calendar: { ...fed.calendar, fetchedAt: at + 1 } },
  { ...fed, rates: { ...fed.rates, fetchedAt: at - 7 * 3600000 } },
  { ...fed, rates: { ...fed.rates, period: '2026-11-01' } },
]) assert.equal(makeAutoReport(events.FOMC, at, at, 'server', soft, modified).bias, 'NO_SIGNAL');
// Units, missing consensus, alias conflict and period mismatch fail closed.
for (const forecast of ['', '0.3', 'NaN', '9K']) {
  const e = structuredClone(events.PPI); e.items[1].forecast = forecast;
  assert.equal(makeAutoReport(e, at, at, 'server', soft).bias, 'NO_SIGNAL');
}
const alias = structuredClone(events.NFP); alias.items.push({ ...alias.items[0], title: 'Nonfarm Payrolls', forecast: '999K' });
assert.equal(makeAutoReport(alias, at, at, 'server', soft).bias, 'NO_SIGNAL');
const mismatch = structuredClone(soft); mismatch.observations[4].period = '2026-10';
assert.equal(makeAutoReport(events.CPI, at, at, 'server', mismatch).bias, 'NO_SIGNAL');
// Threshold edge uses decimal rounding, and K/M units are equivalent.
const edge = macro([100, 4.1, 0.2, 0.2, 0.2, 0.2, 0.2]);
assert.equal(makeAutoReport(events.CPI, at, at, 'server', edge).bias, 'BUY');
const million = structuredClone(events.NFP); million.items[0].forecast = '0.15M';
assert.equal(makeAutoReport(million, at, at, 'server', edge).bias, 'BUY');
// Legacy reports remain unchanged and don't silently acquire new retrospective signals.
const legacy = makeAutoReport(events.PPI, at, at, 'server'); delete legacy.analysis;
assert.deepEqual(readAutoReport(legacy), legacy);
const core = parseMacro({ status: 'REQUEST_SUCCEEDED', Results: { series: [{ seriesID: 'WPSFD49104', data: [{ year: '2026', period: 'M09', value: '100.5' }, { year: '2026', period: 'M08', value: '100' }] }] } }, at);
assert.equal(core.observations[0].value, 0.5);
assert.equal(core.missing.length, 8);
assert.equal(needsCorePpi(core), false);
assert.equal(needsCorePpi({ ...core, observations: [] }), true);
assert.equal(needsCorePpi({ ...core, observations: [], missing: ['PPI tanpa makanan/energi m/m: data BLS tidak lengkap.'] }), false);
console.log('Passed: all four experimental biases, conflict/neutral/missing gates, units, periods, freshness, cutoff, snapshot tampering, legacy compatibility and core PPI.');
