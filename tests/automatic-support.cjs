const assert = require('node:assert/strict');
const { SUPPORT_META, parseSupportCsv, parseAdp, readSupport, fetchSupport, supportDetail, selectSupportAsOf } = require('../.test-build/automaticSupport.js');
const { parseCalendar, makeAutoReport, readAutoReport } = require('../.test-build/automatic.js');
const { encodeAutomaticCache } = require('../.test-build/automaticCache.js');
const at = Date.parse('2026-11-12T12:00Z');
const blank = (stamp = at) => ({ version: 1, checkedAt: stamp, series: SUPPORT_META.map(m => ({ id: m.id, fetchedAt: null, attemptedAt: stamp, points: [], error: 'Not yet available' })) });
const csv = 'observation_date,ICSA,CCSA\n2026-10-10,200000,1800000\n2026-10-17,190000,1810000\n2026-10-24,210000,1820000\n2026-10-31,1800000,1830000\n2026-11-07,195000,.\n2026-11-14,9999999,9999999\n';
const claims = parseSupportCsv(csv, ['ICSA', 'CCSA'], at);
assert.equal(claims[0].points[0].period, '2026-11-07');
assert.equal(claims[1].points[0].period, '2026-10-31'); // Different lags must stay separate.
assert(supportDetail(claims[0], at).text.includes('rata-rata 4 minggu'));
assert.equal(supportDetail(claims[0], at + 7 * 3600000).status, 'stale');
assert.equal(supportDetail(claims[0], at - 1).status, 'missing');
const gap = structuredClone(claims[0]); gap.points.splice(1, 1);
assert(!supportDetail(gap, at).text.includes('rata-rata 4 minggu'));
assert.throws(() => parseSupportCsv(csv + '2026-11-07,1,1\n', ['ICSA', 'CCSA'], at));
assert.throws(() => parseSupportCsv(csv.replace('2026-11-07', '2026-11-08'), ['ICSA', 'CCSA'], at));
assert.throws(() => parseSupportCsv(csv.replace('195000', 'NaN'), ['ICSA', 'CCSA'], at));
assert.throws(() => parseSupportCsv('observation_date,ICSA,ICSA\n', ['ICSA'], at));
const absent = parseSupportCsv('observation_date,ICSA\n2026-11-07,195000\n', ['ICSA', 'CCSA'], at);
assert.equal(absent[1].fetchedAt, null); assert(absent[1].error);
const pce = parseSupportCsv('observation_date,PCEPILFE\n2026-08-01,100\n2026-09-01,100.3\n', ['PCEPILFE'], at)[0];
assert(supportDetail(pce, at).text.includes('m/m 0.30%'));
const pceGap = structuredClone(pce); pceGap.points[1].period = '2026-07-01';
assert(!supportDetail(pceGap, at).text.includes('m/m'));
assert.throws(() => parseSupportCsv('observation_date,PCEPILFE\n2026-09-02,100\n', ['PCEPILFE'], at));
assert.throws(() => parseSupportCsv('observation_date,PCEPILFE\n2026-09-01,-100\n', ['PCEPILFE'], at));
assert.throws(() => parseSupportCsv(csv.replace('195000', '-195000'), ['ICSA', 'CCSA'], at));
const adpRaw = { reportType: 'NER', reportYear: '2026', reportMonth: 'October', reportPressReleaseLink: 'https://adpemploymentreport.com/artifacts/us_ner/20261104/report.pdf', reportOverview: {
  title: 'Private employers added 86,000 jobs in October', cards: [{ title: 'October 2026', metricName: 'Employment Change', metricValue: '86,000', metricDirection: 'up' }],
} };
const adp = parseAdp(adpRaw, at); assert.equal(adp.points[0].value, 86); assert.equal(adp.releaseDate, '2026-11-04');
assert.equal(supportDetail(adp, at, { kind: 'NFP', release: Date.parse('2026-11-13T13:30Z') }).status, 'available');
assert.equal(supportDetail(adp, at, { kind: 'NFP', release: Date.parse('2026-12-04T13:30Z') }).status, 'missing');
const negative = structuredClone(adpRaw); negative.reportOverview.title = 'Private employers lost 86,000 jobs in October'; negative.reportOverview.cards[0].metricDirection = 'down';
assert.equal(parseAdp(negative, at).points[0].value, -86);
assert.throws(() => parseAdp(adpRaw, Date.parse('2026-11-03T12:00Z')));
assert.throws(() => parseAdp({ ...adpRaw, reportYear: '2027' }, at));
assert.throws(() => parseAdp({ ...adpRaw, reportPressReleaseLink: 'https://evil.example/report.pdf' }, at));
const inconsistent = structuredClone(adpRaw); inconsistent.reportOverview.cards[0].metricDirection = 'down';
assert.throws(() => parseAdp(inconsistent, at));
const support = blank();
for (const row of [...claims, adp, pce]) support.series[support.series.findIndex(r => r.id === row.id)] = row;
assert.deepEqual(readSupport(structuredClone(support)), support);
assert.throws(() => readSupport({ ...support, checkedAt: at - 1 }));
assert.throws(() => readSupport({ ...support, series: [...support.series, adp] }));
const future = structuredClone(support); future.series[0].points[0].period = '2026-11-14';
assert.throws(() => readSupport(future));
const revised = structuredClone(support); revised.checkedAt = at + 3600000; revised.series[0].attemptedAt = revised.checkedAt; revised.series[0].fetchedAt = revised.checkedAt; revised.series[0].points[0].value = 300000;
assert.equal(selectSupportAsOf([revised, support], at), support);
assert.equal(selectSupportAsOf([revised], at), null);
assert.equal(selectSupportAsOf([support, revised], revised.checkedAt), revised);
const event = parseCalendar([{ country: 'USD', title: 'PPI m/m', forecast: '0.3%', previous: '0.5%', date: '2026-11-12T13:30:00Z' }], at).events[0];
const report = makeAutoReport(event, at, at, 'server', null, null, support);
assert.deepEqual(readAutoReport(structuredClone(report)), report);
const saved = JSON.stringify(report); support.series[0].points[0].value = 1;
assert.equal(JSON.stringify(report), saved);
assert.equal(makeAutoReport(event, at, at, 'server', null, null, revised).support, undefined);
assert.throws(() => readAutoReport({ ...report, support: revised }));
assert.throws(() => readAutoReport({ ...report, support: null }));
const large = { reports: Array.from({ length: 100 }, (_, i) => ({ id: i, text: '字'.repeat(10000) })), calendar: {} };
const encoded = encodeAutomaticCache(large), decoded = JSON.parse(encoded);
assert(Buffer.byteLength(encoded, 'utf8') <= 1500000); assert(decoded.reports.length < 100); assert.equal(decoded.reports[0].id, 0); assert.equal(large.reports.length, 100);
assert.throws(() => encodeAutomaticCache({ reports: [], padding: 'x'.repeat(500001) }));

(async () => {
  const original = global.fetch;
  const now = Date.now(), old = blank(now - 8 * 3600000);
  // Use today's observation only as a synthetic fixture; it is not a publication timestamp.
  const real = { id: 'DGS2', fetchedAt: old.checkedAt, attemptedAt: old.checkedAt, points: [{ period: new Date(old.checkedAt - 86400000).toISOString().slice(0, 10), value: 4 }] };
  old.series[old.series.findIndex(s => s.id === 'DGS2')] = real;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: false, status: 503 }; };
  try {
    const result = await fetchSupport(old);
    assert.equal(calls, 4);
    const retained = result.series.find(s => s.id === 'DGS2');
    assert.equal(retained.fetchedAt, real.fetchedAt); assert.deepEqual(retained.points, real.points); assert(retained.error.includes('503'));
    await fetchSupport(result); assert.equal(calls, 4); // Failed source backoff preserved.
    assert(result.series.every(r => r.error));
  } finally { global.fetch = original; }
  console.log('Passed: supporting data units, signs, periods, publication-date boundaries, missing series, stale data, immutable vintages, as-of selection, source failure and backoff.');
})().catch(e => { console.error(e); process.exitCode = 1; });
