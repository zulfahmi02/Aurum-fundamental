const assert = require('node:assert/strict');
const { PPI_DATASET: data } = require('../.test-build/data/ppiFirst.js');
const { emptyPpi, ppiNumber, fitPpi, forecastPpi, evaluatePpi, PPI_EVALUATION, savePpiPlan,
  appendPpiRelease, recordPpi, parsePpi, readPpi, PPI_KEY } = require('../.test-build/ppiModel.js');
const { parseBackup } = require('../.test-build/backup.js');
const { restoreLocal, recoverRestore, RESTORE_KEY } = require('../.test-build/localBackup.js');
const clone = value => JSON.parse(JSON.stringify(value));
const release = Date.parse('2026-11-13T13:30:00Z');
const now = release - 5 * 3600000;
const plan = { target: '2026-10', release, consensus: 0.2, source: 'Synthetic consensus for test only', at: now };
const state = savePpiPlan(emptyPpi(), plan, now);
assert.equal(data.rows.length, 32);
assert.equal(data.rows.some(r => r.period === '2025-10'), false);
assert.equal(data.rows.find(r => r.period === '2024-03').value, 0.2); // initial, not April's revised -0.1
assert.equal(data.rows.at(-1).value, 1.3);
assert.equal(new Date(data.rows[0].publishedAt).toISOString(), '2024-02-16T13:30:00.000Z');
assert.equal(new Date(data.rows[1].publishedAt).toISOString(), '2024-03-14T12:30:00.000Z');
assert.equal(new Date(data.rows.find(r => r.period === '2025-09').publishedAt).toISOString(), '2025-11-25T13:30:00.000Z');
for (const row of data.rows) {
  const day = row.source.match(/ppi_(\d{2})(\d{2})(\d{4})/);
  assert.equal(new Date(row.publishedAt).toISOString().slice(0, 10), `${day[3]}-${day[1]}-${day[2]}`);
  assert.equal(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }).format(row.publishedAt), '08:30');
}
assert.equal(ppiNumber('0,2'), 0.2);
assert.equal(ppiNumber('-.1'), -0.1);
for (const value of ['', ' ', '0.2%', '1e2', 'Infinity', '0,2,3', '-101']) assert.throws(() => ppiNumber(value));
const live = forecastPpi(plan, now).forecast;
assert(live);
assert.equal(live.consensus, 0.2);
assert.equal(live.difference, live.estimate - 0.2); // percentage points, never multiplied by 100
assert.deepEqual(live.inputs.map(r => r.period), ['2026-07', '2026-08', '2026-09']);
assert.equal(forecastPpi(plan, release - 5 * 60000).forecast !== null, true);
assert.equal(forecastPpi(plan, release - 5 * 60000 + 1).forecast, null);
assert.equal(forecastPpi(plan, now - 1).forecast, null);
assert.equal(forecastPpi({ ...plan, at: data.capturedAt - 1 }, data.capturedAt - 1).forecast, null);
assert.equal(forecastPpi({ ...plan, target: '2026-09' }, now).forecast, null);
assert.equal(forecastPpi({ ...plan, target: '2026-11', release: Date.parse('2026-12-15T13:30Z') }, now).forecast, null);
assert.throws(() => savePpiPlan(emptyPpi(), { ...plan, at: release - 1 }, release - 1));

// Future target/outcomes cannot leak into an earlier prediction.
const target = data.rows.find(r => r.period === '2025-04');
const cutoff = target.publishedAt - 5 * 60000;
const expected = fitPpi(data.rows, target.period, cutoff);
const changedFuture = data.rows.map(r => r.period >= target.period ? { ...r, value: 99 } : r);
assert.deepEqual(fitPpi(changedFuture, target.period, cutoff), expected);
assert.deepEqual(fitPpi(data.rows.filter(r => r.period < target.period), target.period, cutoff), expected);
assert.equal(fitPpi(data.rows.filter(r => r.period !== '2025-03'), target.period, cutoff), null);
assert.equal(fitPpi(data.rows.map(r => r.period === '2025-03' ? { ...r, publishedAt: target.publishedAt } : r), target.period, cutoff), null);
assert.equal(fitPpi(data.rows, '2025-01', Date.parse('2025-02-13T13:25Z')), null); // insufficient training
assert.throws(() => fitPpi([...data.rows, data.rows[0]], '2026-10', now));
// A late release must not enter any historical training pair at an earlier publication.
const sameTime = data.rows.map(r => r.period === '2024-02' ? { ...r, publishedAt: data.rows[3].publishedAt } : r);
assert(fitPpi(sameTime, '2026-10', now).fit.count < fitPpi(data.rows, '2026-10', now).fit.count);
assert.equal(PPI_EVALUATION.count, 14);
assert.equal(PPI_EVALUATION.missingOrSkipped, 4);
assert.deepEqual(evaluatePpi(changedFuture, '2025-04', '2025-04').predictions[0].estimate, expected.estimate);
assert(PPI_EVALUATION.predictions.every(p => p.trainingThrough < p.target));
assert(!PPI_EVALUATION.predictions.some(p => ['2025-10', '2025-11', '2025-12', '2026-01'].includes(p.target)));

// Manual versions obey recorded-at cutoff and cannot rewrite frozen snapshots.
const snapshotState = recordPpi(state, now);
const frozen = JSON.stringify(snapshotState.history[0]);
assert.deepEqual(parsePpi(clone(snapshotState)), snapshotState);
assert.throws(() => recordPpi(state, now - 1));
assert.doesNotThrow(() => recordPpi(state, release - 5 * 60000));
assert.throws(() => recordPpi(state, release - 5 * 60000 + 1));
const correction = { ...data.rows.at(-1), value: 1.2 };
const corrected = appendPpiRelease(snapshotState, correction, now + 1000);
assert.equal(forecastPpi(plan, now, corrected.releases).forecast.estimate, live.estimate);
assert.equal(forecastPpi(plan, now + 1000, corrected.releases).forecast.inputs.at(-1).value, 1.2);
assert.equal(JSON.stringify(corrected.history[0]), frozen);
assert.throws(() => appendPpiRelease(state, { ...correction, publishedAt: now + 1 }, now));
assert.throws(() => appendPpiRelease(state, { ...correction, source: 'https://www.bls.gov.evil.example/news.release/archives/ppi_10152026.htm' }, now));
const newActual = { period: '2026-10', value: 0.4, publishedAt: release, source: 'https://www.bls.gov/news.release/archives/ppi_11132026.htm' };
const extended = appendPpiRelease(state, newActual, release + 1000);
const nextPlan = { ...plan, target: '2026-11', release: Date.parse('2026-12-15T13:30Z'), at: release + 1000 };
assert(forecastPpi(nextPlan, release + 1000, extended.releases).forecast);
assert.throws(() => parsePpi({ ...emptyPpi(), unit: 'index' }));
assert.throws(() => readPpi('null'));
assert.deepEqual(readPpi(null), emptyPpi());
for (const mutate of [
  s => { s.history[0].forecast.estimate += 1; },
  s => { s.history[0].forecast.inputs[0].period = '2026-10'; },
  s => { s.history[0].forecast.estimatedAt = release; },
  s => { s.history[0].forecast.datasetKnownAt = now + 1; },
  s => { s.history.push(s.history[0]); },
]) {
  const bad = clone(snapshotState); mutate(bad); assert.throws(() => parsePpi(bad));
}
const blank = { version: 1, plan: null, cache: null, history: [] };
assert.deepEqual(parseBackup(blank), blank);
assert.deepEqual(parseBackup({ ...blank, ppi: snapshotState }).ppi, snapshotState);
assert.throws(() => parseBackup({ ...blank, ppi: {} }));
const values = new Map(); let fail = false;
const store = {
  async getItem(k) { return values.get(k) ?? null; }, async setItem(k, v) { values.set(k, v); },
  async removeItem(k) { values.delete(k); },
  async multiSet(rows) { for (const [k, v] of rows) { values.set(k, v); if (fail && k === PPI_KEY) throw new Error('Interrupted'); } },
};
(async () => {
  fail = true;
  await assert.rejects(restoreLocal(store, { ...blank, ppi: snapshotState }), /Interrupted/);
  assert(values.has(RESTORE_KEY)); fail = false;
  await recoverRestore(store);
  assert.deepEqual(readPpi(values.get(PPI_KEY)), snapshotState);
  assert(!values.has(RESTORE_KEY));
  await restoreLocal(store, blank);
  assert.deepEqual(readPpi(values.get(PPI_KEY)), emptyPpi());
  console.log('Passed: PPI first releases, DST timestamps, units, chronology, publication/recording cutoffs, missing months, immutable snapshots, backup and recovery.');
})().catch(e => { console.error(e); process.exitCode = 1; });
