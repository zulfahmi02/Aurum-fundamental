const assert = require('node:assert/strict');
const { parseFedCalendar, parseFedRates, readFedContext, newYorkDate, parseFedDecision, fetchFedContext } = require('../.test-build/automaticFed.js');
const { makeAutoReport, parseCalendar, readAutoReport } = require('../.test-build/automatic.js');
const { observeBlsRelease, matchFedDecision, readAutoOutcome, latestPreparation } = require('../.test-build/automaticOutcomes.js');
const at = Date.parse('2026-11-12T01:30:00Z');
const html = `<h4>2026 FOMC Meetings</h4><div class="fomc-meeting__month"><strong>October</strong></div><div class="fomc-meeting__date">27-28</div>
<div class="fomc-meeting__month"><strong>December</strong></div><div class="fomc-meeting__date">8-9*</div>
<h4>2027 FOMC Meetings</h4><div class="fomc-meeting__month">Apr/May</div><div class="fomc-meeting__date">30-1</div>`;
const fedCalendar = parseFedCalendar(html, at);
assert.deepEqual(fedCalendar.meetings, [{ date: '2026-10-28', projections: false }, { date: '2026-12-09', projections: true }, { date: '2027-05-01', projections: false }]);
assert.throws(() => parseFedCalendar('<html>Access denied</html>', at));
assert.equal(newYorkDate(Date.parse('2026-11-12T01:30Z')), '2026-11-11');
const csv = 'observation_date,DFEDTARL,DFEDTARU\n2026-11-10,3.75,4.00\n2026-11-11,3.75,4.00\n2026-11-12,4,4.25\n';
const rates = parseFedRates(csv, at);
assert.equal(rates.period, '2026-11-11'); // Future New York date cannot enter the context.
assert.equal(rates.upper, 4);
assert.throws(() => parseFedRates(csv + '2026-11-11,3.75,4.00\n', at));
assert.throws(() => parseFedRates('observation_date,DFEDTARL,DFEDTARU\n2026-11-11,5,4\n', at));
const fed = { version: 1, calendar: fedCalendar, rates, errors: [] };
assert.deepEqual(readFedContext(fed), fed);
assert.throws(() => readFedContext({ ...fed, rates: { ...rates, lower: 5 } }));
const statement = `<p class="article__time">October 28, 2026</p><h3>Federal Reserve issues FOMC statement</h3>
<p>For release at 2:00 p.m. EDT</p><p>maintain the target range for the federal funds rate at 3-3/4 to 4 percent.</p>
<p>A dissenter preferred a different rate.</p>`;
const release = Date.parse('2026-10-28T18:00Z');
const decision = parseFedDecision(statement, '2026-10-28', release + 1000);
assert.equal(decision.lower, 3.75); assert.equal(decision.upper, 4); assert.equal(decision.publishedAt, release);
assert.throws(() => parseFedDecision(statement, '2026-10-29', release + 1000));
assert.throws(() => parseFedDecision(statement, '2026-10-28', release - 1));
assert.throws(() => parseFedDecision(statement.replace('3-3/4 to 4 percent', 'an unspecified range'), '2026-10-28', release + 1000));
const winter = parseFedDecision(statement.replaceAll('October 28', 'December 9').replace('EDT', 'EST'), '2026-12-09', Date.parse('2026-12-09T20:00Z'));
assert.equal(winter.publishedAt, Date.parse('2026-12-09T19:00Z'));
const fomc = parseCalendar([{ country: 'USD', title: 'Federal Funds Rate', date: '2026-10-28T14:00:00-04:00', forecast: '4.25%', previous: '4.25%' }], release - 3600000).events[0];
const report = makeAutoReport(fomc, release - 3600000, release - 3600000, 'server');
const fractionalConsensus = JSON.parse(JSON.stringify(fomc)); fractionalConsensus.items[0].forecast = '4.125%';
const beforeFed = { version: 1, calendar: { fetchedAt: release - 7200000, meetings: [{ date: '2026-10-28', projections: false }] },
  rates: { fetchedAt: release - 7200000, period: '2026-10-27', lower: 3.75, upper: 4 }, errors: [] };
assert(makeAutoReport(fractionalConsensus, release - 3600000, release - 3600000, 'server', null, beforeFed).reasons.some(r => r.includes('12.5 basis poin')));
const result = matchFedDecision(report, decision, release + 2000);
assert.equal(result.quality, 'official-statement'); assert.equal(result.difference, -0.25);
assert.deepEqual(readAutoOutcome(result), result);
assert.equal(matchFedDecision(report, { ...decision, publishedAt: release + 60000 }, release + 120000), null);
assert.equal(matchFedDecision(report, { ...decision, source: 'https://example.com/' }, release + 120000), null);
assert.throws(() => readAutoOutcome({ ...result, difference: 100 }));
assert.throws(() => readAutoOutcome({ ...result, lower: 5 }));

const ppiRelease = Date.parse('2026-11-13T13:30Z');
const prep = ppiRelease - 5 * 3600000;
const ppiEvent = parseCalendar([{ country: 'USD', title: 'PPI m/m', date: '2026-11-13T08:30:00-05:00', forecast: '0.2%', previous: '1.3%' }], prep).events[0];
const macro = { fetchedAt: prep, observations: [{ id: 'WPSFD4', label: 'PPI headline m/m', unit: '%', period: '2026-09', value: 1.3 }], missing: [] };
const ppiReport = makeAutoReport(ppiEvent, prep, prep, 'server', macro);
const frozen = JSON.stringify(ppiReport);
const updated = { ...macro, fetchedAt: ppiRelease + 3600000, observations: [{ ...macro.observations[0], period: '2026-10', value: 0.35 }] };
const observed = observeBlsRelease(ppiReport, updated, ppiRelease + 3600000);
assert.equal(observed.quality, 'post-release-observation');
assert.equal(observed.value, 0.35); // Not silently rounded/relabelled as certified headline actual.
assert.equal(observed.publishedAt, undefined);
assert.deepEqual(readAutoOutcome(observed), observed);
assert.equal(observeBlsRelease(ppiReport, { ...updated, fetchedAt: ppiRelease - 1 }, ppiRelease + 3600000), null);
assert.equal(observeBlsRelease(ppiReport, updated, ppiRelease + 73 * 3600000), null);
assert.equal(observeBlsRelease({ ...ppiReport, macro: undefined, analysis: undefined }, updated, updated.fetchedAt), null);
assert.equal(observeBlsRelease({ ...ppiReport, origin: 'device' }, updated, updated.fetchedAt), null);
for (const period of ['2026-09', '2026-11']) assert.equal(observeBlsRelease(ppiReport, { ...updated, observations: [{ ...updated.observations[0], period }] }, updated.fetchedAt), null);
assert.throws(() => readAutoOutcome({ ...observed, quality: 'official-statement' }));
assert.throws(() => readAutoOutcome({ ...observed, source: 'https://evil.example' }));
macro.observations[0].value = 9;
assert.equal(JSON.stringify(ppiReport), frozen);
assert.deepEqual(readAutoReport(ppiReport), ppiReport);
const latePrep = makeAutoReport(ppiEvent, prep, ppiRelease - 600000, 'server', macro);
assert.equal(latestPreparation([ppiReport, latePrep])[0].id, latePrep.id);
const legacy = JSON.parse(JSON.stringify(ppiReport)); delete legacy.macro; delete legacy.analysis;
assert.deepEqual(readAutoReport(legacy), legacy);

(async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: false, status: 503 }; };
  try {
    const now = Date.now();
    const fresh = { ...fed, calendar: { ...fedCalendar, fetchedAt: now }, rates: { ...rates, fetchedAt: now } };
    assert.deepEqual(await fetchFedContext(fresh), fresh); assert.equal(calls, 0);
    const old = { ...fed, calendar: { ...fedCalendar, fetchedAt: now - 2 * 86400000 }, rates: { ...rates, period: newYorkDate(now - 86400000), fetchedAt: now - 86400000 } };
    const failed = await fetchFedContext(old);
    assert.equal(failed.errors.length, 2); assert.equal(failed.calendar.fetchedAt, old.calendar.fetchedAt);
    assert.equal(failed.rates.fetchedAt, old.rates.fetchedAt);
  } finally { global.fetch = original; }
  console.log('Passed: official Fed calendar/rates/statement parsing, DST, source failures, structured snapshots and conservative post-release matching.');
})().catch(e => { console.error(e); process.exitCode = 1; });
