const assert = require('node:assert/strict');
const { parseCalendar, readCalendar, reportSchedule, dueStage, makeAutoReport, readAutoReport, consensusNumber } = require('../.test-build/automatic.js');
const time = Date.parse;
const now = time('2026-11-13T00:00:00Z');
const fixture = [
  { country: 'USD', title: 'PPI m/m', date: '2026-11-13T08:30:00-05:00', forecast: '0.4%', previous: '1.3%' },
  { country: 'USD', title: 'Core PPI m/m', date: '2026-11-13T08:30:00-05:00', forecast: '0.3%', previous: '0.7%' },
  { country: 'USD', title: 'FOMC Member Speaks', date: '2026-11-13T08:30:00-05:00' },
  { country: 'USD', title: 'FOMC Press Conference', date: '2026-11-13T14:30:00-05:00' },
  { country: 'CAD', title: 'CPI m/m', date: '2026-11-13T08:30:00-05:00' },
];
const calendar = parseCalendar(fixture, now);
assert.equal(calendar.events.length, 1);
assert.equal(calendar.events[0].items.length, 2);
assert.deepEqual(readCalendar(JSON.parse(JSON.stringify(calendar))), calendar);
const event = calendar.events[0], release = event.release;
assert.equal(release, time('2026-11-13T13:30:00Z'));
assert.equal(parseCalendar([{ ...fixture[0], date: '2026-07-14T08:30:00-04:00' }], now).events[0].release, time('2026-07-14T12:30:00Z'));
assert.deepEqual(reportSchedule(release).map(s => [s.stage, new Date(s.at).toISOString()]), [
  ['morning', '2026-11-13T00:00:00.000Z'], ['five-hours', '2026-11-13T08:30:00.000Z'], ['pre-entry', '2026-11-13T13:20:00.000Z'],
]);
assert.equal(reportSchedule(time('2026-10-28T18:00:00Z'))[0].at, time('2026-10-28T00:00:00Z')); // Thu 01 WIB -> Wed 07 WIB
assert.equal(reportSchedule(time('2026-12-16T19:00:00Z'))[0].at, time('2026-12-16T00:00:00Z')); // Thu 02 WIB
assert.equal(dueStage(release, now - 1), null);
assert.equal(dueStage(release, now).stage, 'morning');
assert.equal(dueStage(release, release - 5 * 3600000).stage, 'five-hours');
assert.equal(dueStage(release, release - 10 * 60000).stage, 'pre-entry');
assert.equal(dueStage(release, release - 5 * 60000).stage, 'pre-entry');
assert.equal(dueStage(release, release - 5 * 60000 + 1), null);
assert.equal(makeAutoReport(event, now + 1, now, 'device'), null);
assert.equal(makeAutoReport(event, release, release, 'server'), null);
const report = makeAutoReport(event, now, now, 'device');
assert.equal(report.bias, 'NO_SIGNAL'); // Lower expected inflation is not an unexpected surprise.
assert(report.reasons.some(r => r.includes('lebih rendah')));
assert.deepEqual(readAutoReport(JSON.parse(JSON.stringify(report))), report);
assert.throws(() => readAutoReport({ ...report, bias: 'BUY' }));
assert.throws(() => readAutoReport({ ...report, generatedAt: release }));
assert.throws(() => readAutoReport({ ...report, scheduledAt: now - 1 }));
const old = makeAutoReport(event, now - 3 * 3600000, now, 'server');
assert(old.missing.some(r => r.includes('dua jam')));
const late = makeAutoReport(event, now, release - 30 * 60000, 'server');
assert.equal(late.stage, 'five-hours'); // No invented morning snapshot when worker starts late.
assert(late.generatedAt > late.scheduledAt);
const frozen = JSON.stringify(report);
event.items[0].forecast = '9%';
assert.equal(JSON.stringify(report), frozen);
assert.deepEqual(consensusNumber('150K'), { value: 150, unit: 'K' });
assert.deepEqual(consensusNumber('0.15M'), { value: 150, unit: 'K' });
assert.deepEqual(consensusNumber('-0.2%'), { value: -0.2, unit: '%' });
for (const s of ['', 'NaN', 'TBA', '4-5%', '1e2']) assert.equal(consensusNumber(s), null);
for (const date of ['TBA', '2026-11-13T08:30:00', '2026-02-30T08:30:00-05:00']) assert.throws(() => parseCalendar([{ ...fixture[0], date }], now));
assert.throws(() => parseCalendar([...fixture, { ...fixture[0], forecast: '8%' }], now));
assert.equal(parseCalendar([...fixture, fixture[0]], now).events.length, 1);
assert.equal(parseCalendar([{ ...fixture[0], title: 'Core CPI m/m' }], now).events.length, 0);
for (const [title, kind] of [['Non-Farm Employment Change', 'NFP'], ['CPI m/m', 'CPI'], ['Federal Funds Rate', 'FOMC']]) {
  assert.equal(parseCalendar([{ ...fixture[0], title }], now).events[0].kind, kind);
}
const unknownConsensus = parseCalendar([{ ...fixture[0], forecast: '' }], now).events[0];
assert(makeAutoReport(unknownConsensus, now, now, 'server').missing.some(r => r.startsWith('Konsensus')));
console.log('Passed: automatic calendar grouping, DST/WIB stages, FOMC date rollover, cutoffs, stale/missing data, no fabricated direction, immutable snapshots.');
