const assert = require('node:assert/strict');
const { parseMacro, readMacro } = require('../.test-build/automaticMacro.js');
const { parseCalendar, makeAutoReport, readAutoReport } = require('../.test-build/automatic.js');
const at = Date.parse('2026-11-13T00:00:00Z');
const payload = { status: 'REQUEST_SUCCEEDED', Results: { series: [
  { seriesID: 'CES0000000001', data: [{ year: '2026', period: 'M09', value: '159000' }, { year: '2026', period: 'M08', value: '158900' }] },
  { seriesID: 'CUSR0000SA0', data: [{ year: '2026', period: 'M09', value: '120.6' }, { year: '2026', period: 'M08', value: '120' }, { year: '2026', period: 'M13', value: '999' }] },
] } };
const macro = parseMacro(payload, at);
assert.equal(macro.observations.length, 2);
assert.equal(macro.observations[0].value, 100);
assert.equal(macro.observations[1].value, 0.5);
assert.equal(macro.missing.length, 7);
assert.deepEqual(readMacro(JSON.parse(JSON.stringify(macro))), macro);
const gap = JSON.parse(JSON.stringify(payload));gap.Results.series[1].data[1].period = 'M07';
assert.equal(parseMacro(gap, at).observations.length, 1);
assert.throws(() => parseMacro({ status: 'REQUEST_FAILED' }, at));
assert.throws(() => readMacro({ ...macro, observations: [...macro.observations, macro.observations[0]] }));
const event = parseCalendar([{ country: 'USD', title: 'CPI m/m', date: '2026-11-13T08:30:00-05:00', forecast: '0.2%', previous: '0.3%' }], at).events[0];
const report = makeAutoReport(event, at, at, 'device', macro);
assert.equal(report.macroFetchedAt, at);
assert(report.reasons.some(s => s.includes('termasuk revisi')));
assert.deepEqual(readAutoReport(report), report);
assert.equal(makeAutoReport(event, at, at, 'device', { ...macro, fetchedAt: at + 1 }).macroFetchedAt, undefined);
assert(makeAutoReport(event, at, at, 'device', { ...macro, fetchedAt: at - 7 * 3600000 }).missing.some(s => s.includes('enam jam')));
console.log('Passed: automatic BLS units, partial series, gaps, revisions label, cache validation and observation cutoff.');
