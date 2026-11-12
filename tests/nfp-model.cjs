const assert = require('node:assert/strict');
const { fitNfp, evaluateNfp, forecastNfp, validNfpForecast, NFP_EVALUATION, NFP_RECENT_EVALUATION } = require('../.test-build/nfpModel.js');
const { NFP_DATASET } = require('../.test-build/data/nfpFirst.js');
const { createSnapshot, readHistory } = require('../.test-build/review.js');
const { parseBackup } = require('../.test-build/backup.js');
const rows = NFP_DATASET.rows;
assert.equal(rows.length, 57);
assert.equal(rows.find(r => r.period === '2024-01').value, 353);
assert.equal(rows.find(r => r.period === '2024-10').value, 12);
assert.equal(rows.find(r => r.period === '2026-07').value, -23);
assert(!rows.some(r => r.period === '2025-10'));
assert.throws(() => fitNfp([...rows, rows[0]], '2026-11'));
assert.throws(() => fitNfp([{period:'2022-01', value:NaN}], '2026-11'));
assert.equal(fitNfp(rows, '2022-06'), null);
for (const target of ['2025-11', '2025-12', '2026-01', '2026-12']) assert.equal(fitNfp(rows, target), null);
assert(fitNfp(rows, '2026-02'));

// Known linear relation: mean(t-3,t-2,t-1) = t-2, target = 10*t.
const linear = Array.from({length:30}, (_, i) => ({
  period: new Date(Date.UTC(2022, i, 1)).toISOString().slice(0,7), value: i * 10,
}));
const fitted = fitNfp(linear, '2024-07');
assert(Math.abs(fitted.estimate - 300) < 1e-8);
assert(Math.abs(fitted.fit.slope - 1) < 1e-8);
assert(Math.abs(fitted.fit.intercept - 20) < 1e-8);
const flat = fitNfp(linear.map(r => ({...r, value:25})), '2024-07');
assert.equal(flat.estimate,25);
assert.equal(flat.fit.slope,0);

// Neither the target actual nor future outcomes affect an earlier forecast.
const changedFuture = rows.map(r => r.period >= '2024-01' ? {...r,value:r.value+100000} : r);
assert.deepEqual(fitNfp(rows,'2024-01'),fitNfp(changedFuture,'2024-01'));
assert.deepEqual(NFP_EVALUATION,evaluateNfp(rows.filter(r => r.period < '2025-01'),'2024-01','2024-12'));
assert.equal(NFP_EVALUATION.count,12);
assert.equal(NFP_EVALUATION.missingOrSkipped,0);
assert.equal(NFP_EVALUATION.predictions[0].trainingCount,21);
assert(NFP_EVALUATION.predictions.every(r => r.trainingThrough < r.target));
assert.equal(NFP_RECENT_EVALUATION.count,18);
assert.equal(NFP_RECENT_EVALUATION.missingOrSkipped,4);
assert(!NFP_RECENT_EVALUATION.predictions.some(p => ['2025-10','2025-11','2025-12','2026-01'].includes(p.target)));
for (const key of ['model','baseline']) {
  const field = key === 'model' ? 'estimate' : 'baseline';
  const errors = NFP_EVALUATION.predictions.map(p => p[field] - p.actual);
  assert.equal(NFP_EVALUATION[key].mae,errors.reduce((sum,e) => sum + Math.abs(e),0)/12);
  assert.equal(NFP_EVALUATION[key].rmse,Math.sqrt(errors.reduce((sum,e) => sum+e*e,0)/12));
}
assert.equal(evaluateNfp(rows,'2030-01','2030-12').model,null);
assert.throws(() => evaluateNfp(rows,'2024-12','2024-01'));

const release = Date.parse('2026-12-04T13:30:00Z');
const now = release - 2*3600000;
const plan = { release, targetMonth:'2026-11', forecast:130, source:'Test fixture only', at:now-60000 };
const prediction = forecastNfp(plan,now).forecast;
assert(validNfpForecast(prediction));
assert.equal(prediction.difference,prediction.estimate-130);
assert.deepEqual(prediction.inputs.map(r => r.period),['2026-08','2026-09','2026-10']);
assert.equal(prediction.fit.through,'2026-10');
assert.equal(forecastNfp(null,now).forecast,null);
assert.equal(forecastNfp({...plan,at:now+1},now).forecast,null);
assert.equal(forecastNfp({...plan,at:NFP_DATASET.capturedAt-2},NFP_DATASET.capturedAt-1).forecast,null);
assert.equal(forecastNfp(plan,release-5*60000+1).forecast,null);
assert(forecastNfp(plan,release-5*60000).forecast);
assert.equal(forecastNfp({...plan,targetMonth:'2026-10'},now).forecast,null);
assert.equal(forecastNfp({...plan,targetMonth:'2026-12',release:Date.parse('2027-01-08T13:30:00Z')},now).forecast,null);
assert(!validNfpForecast({...prediction,estimate:NaN}));
assert(!validNfpForecast({...prediction,difference:99999}));
assert(!validNfpForecast({...prediction,inputs:[]}));

const cache = {version:1,fetchedAt:now-1000,data:{payroll:[],unemployment:[],jolts:[],cpi:[],ppi:[]}};
const snapshot = createSnapshot(cache,plan,now);
assert.deepEqual(snapshot.nfpForecast,prediction);
const legacy = {...snapshot}; delete legacy.nfpForecast;
assert.deepEqual(readHistory(JSON.stringify([legacy])),[legacy]);
const backup = parseBackup({version:1,plan,cache,history:[snapshot]});
assert.deepEqual(backup.history[0].nfpForecast,prediction);
plan.forecast = 900;
assert.equal(snapshot.nfpForecast.consensus,130);
for (const bad of [
  {...snapshot,nfpForecast:{...prediction,difference:99999}},
  {...snapshot,nfpForecast:{...prediction,target:'2026-12'}},
  {...snapshot,nfpForecast:{...prediction,estimatedAt:now+1}},
  {...snapshot,plan:{...snapshot.plan,forecast:900}},
]) assert.throws(() => readHistory(JSON.stringify([bad])));
console.log('Passed: initial-release dataset, trained coefficients, chronological evaluation, no future leakage, missing months, cutoff guards, immutable forecast and backup compatibility.');
