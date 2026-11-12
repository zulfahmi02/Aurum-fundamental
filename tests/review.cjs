const assert = require('node:assert/strict');
const { reviewFundamentals, createSnapshot, readCache, readHistory } = require('../.test-build/review.js');
const { monthly, fetchFundamentals, SERIES } = require('../.test-build/fundamentals.js');
const release = Date.parse('2026-12-04T13:30:00Z');
const now = release - 2 * 3600000;
const plan = { release, targetMonth: '2026-11', forecast: 130, source: 'Test fixture', at: now - 60000 };
const cache = { version: 1, fetchedAt: now - 60000, data: {
  payroll: [{period:'2026-10',change:150},{period:'2026-09',change:180}],
  unemployment: [{period:'2026-10',value:4.2},{period:'2026-09',value:4.1}],
  jolts: [{period:'2026-09',value:7000},{period:'2026-08',value:7100}],
  cpi: [{period:'2026-10',value:0.3},{period:'2026-09',value:0.2}], ppi: [],
}};
assert.equal(reviewFundamentals(null, null, now).title, 'MENUNGGU DATA');
const review = reviewFundamentals(cache, plan, now);
assert(review.evidence.find(e=>e.key==='unemployment').text.includes('Naik 0,1 poin persentase'));
assert(review.evidence.find(e=>e.key==='payroll').text.includes('Turun 30 ribu pekerjaan'));
assert(review.gaps.some(x=>x.includes('PPI')));
assert(!review.evidence.some(e=>e.text.includes('BUY') || e.text.includes('SELL')));
assert(reviewFundamentals(cache, plan, release).gaps.some(x=>x.includes('sudah lewat')));
assert(!reviewFundamentals(cache, plan, release).evidence.some(e=>e.label==='Konsensus yang kamu catat'));
const snapshot = createSnapshot(cache, plan, now);
assert.equal(snapshot.plan.forecast, 130);
plan.forecast = 999;
cache.data.payroll[0].change = 999;
assert.equal(snapshot.plan.forecast, 130);
assert.equal(snapshot.cache.data.payroll[0].change, 150);
assert.deepEqual(readHistory(JSON.stringify([snapshot])), [snapshot]);
assert.deepEqual(readCache(JSON.stringify(cache)), cache);
assert.throws(()=>readCache('{bad json'));
assert.throws(()=>readCache(JSON.stringify({...cache, data:{payroll:[]}})));
assert.throws(()=>readHistory(JSON.stringify([{...snapshot,review:{title:'x'}}])));
assert.throws(()=>createSnapshot(cache, plan, release));
assert.throws(()=>createSnapshot(cache, plan, release - 5*3600000 - 1));
assert.throws(()=>createSnapshot(cache, plan, release - 5*60000 + 1));
const earliest = release - 5*3600000;
assert(createSnapshot({...cache,fetchedAt:earliest}, {...plan,at:earliest}, earliest));
assert(createSnapshot(cache, plan, release - 5*60000));
assert.throws(()=>createSnapshot({...cache, fetchedAt:now-24*3600000}, plan, now));
assert.throws(()=>createSnapshot({...cache, fetchedAt:now+1}, plan, now));
assert.throws(()=>createSnapshot(cache, {...plan,at:now+1}, now));
assert.deepEqual(monthly([{year:'2026',period:'M01',value:''},{year:'2026',period:'M02',value:' '},null]), []);
// Actual fetch pipeline with partial series response. Missing series are not fabricated.
const originalFetch = global.fetch;
global.fetch = async()=>({ok:true,json:async()=>({status:'REQUEST_SUCCEEDED',Results:{series:[{seriesID:SERIES.payroll,data:[{year:'2026',period:'M01',value:'1000'},{year:'2026',period:'M02',value:'1100'}]}]}})});
(async()=>{
 const result = await fetchFundamentals();
 assert.deepEqual(result.payroll,[{period:'2026-02',change:100}]);
 assert.deepEqual(result.ppi,[]);
 global.fetch = async()=>({ok:false,status:429});
 await assert.rejects(fetchFundamentals(),/429/);
 global.fetch = originalFetch;
 console.log('Passed: review explanations, missing data, cache validation, immutable snapshots, timing guards, partial API and HTTP failures.');
})().catch(e=>{global.fetch=originalFetch;console.error(e);process.exitCode=1;});
