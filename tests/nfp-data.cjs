const assert = require('node:assert/strict');
const { parseClaimsCsv, fourWeekAverage, validClaimsSeries, fetchClaimsData } = require('../.test-build/claims.js');
const { referenceSaturday, validTargetMonth, validWeek } = require('../.test-build/periods.js');
const { reviewFundamentals, readCache, createSnapshot, readHistory } = require('../.test-build/review.js');
const { parseBackup } = require('../.test-build/backup.js');
const { changes, monthly } = require('../.test-build/fundamentals.js');

const csv = 'observation_date,ICSA\n2026-10-03,200000\n2026-10-10,210000\n2026-10-17,220000\n2026-10-24,230000\n2026-10-31,.\n';
const points = parseClaimsCsv(csv, 'ICSA');
assert.equal(points[0].period, '2026-10-24');
assert.equal(fourWeekAverage(points), 215000);
assert.equal(fourWeekAverage(points.slice(1)), null);
assert.equal(fourWeekAverage([...points.slice(0,3),{period:'2026-09-26',value:200000}]), null);
assert.throws(()=>parseClaimsCsv(csv,'CCSA'));
assert.throws(()=>parseClaimsCsv('<html>Access denied</html>','ICSA'));
assert.throws(()=>parseClaimsCsv('observation_date,ICSA\n2026-02-30,100','ICSA'));
assert.throws(()=>parseClaimsCsv('observation_date,ICSA\n2026-10-24,-100','ICSA'));
assert.throws(()=>parseClaimsCsv('observation_date,ICSA\n2026-10-24,100\n2026-10-24,200','ICSA'));
assert.equal(referenceSaturday('2026-10'), '2026-10-17');
assert.equal(referenceSaturday('2026-12'), '2026-12-12');
assert.equal(validWeek('2026-10-23'), false);
const release = Date.parse('2026-11-06T13:30:00Z');
const now = release - 2*3600000;
assert(validTargetMonth('2026-10', release));
assert(validTargetMonth('2026-08', release)); // delayed release is valid
assert(!validTargetMonth('2026-11', release));
assert(!validTargetMonth('2026-13', release));
assert.deepEqual(changes(monthly([{year:'2026',period:'M08',value:'30'},{year:'2026',period:'M09',value:'30.15'}]),'pct'),[{period:'2026-09',value:0.5}]);
const plan = {release,targetMonth:'2026-10',forecast:130,source:'Fixture',at:now-1000};
const cache = {version:1,fetchedAt:now-1000,data:{
 payroll:[{period:'2026-10',change:999},{period:'2026-09',change:100},{period:'2026-08',change:120}],
 unemployment:[{period:'2026-09',value:4.1}],jolts:[],cpi:[],ppi:[],
 wages:[{period:'2026-09',value:0.5},{period:'2026-08',value:0.3}],
 claims:{initial:{id:'ICSA',status:'available',fetchedAt:now-1000,points},continued:{id:'CCSA',status:'unavailable',fetchedAt:now-1000,points:[],error:'HTTP 503'}},
}};
assert(validClaimsSeries(cache.data.claims.initial,'ICSA'));
assert(!validClaimsSeries(cache.data.claims.initial,'CCSA'));
assert(!validClaimsSeries({...cache.data.claims.initial,points:[{period:'bad',value:1}]},'ICSA'));
const review = reviewFundamentals(cache,plan,now);
assert(review.evidence.find(e=>e.key==='payroll').text.includes('2026-09: 100'));
assert(!review.evidence.some(e=>e.text.includes('999')));
assert(review.evidence.find(e=>e.key==='wages').text.includes('Naik 0,2 poin persentase'));
assert(review.evidence.find(e=>e.key==='initialClaims').text.includes('215.000'));
assert(review.evidence.find(e=>e.key==='initialClaims').text.includes('2026-10-17'));
assert(review.gaps.some(g=>g.includes('HTTP 503')));
const late = JSON.parse(JSON.stringify(cache));
late.fetchedAt=release;late.data.claims.initial.fetchedAt=release;
assert.equal(reviewFundamentals(late,plan,release+1000).evidence.length,0);
assert.equal(reviewFundamentals({...cache,fetchedAt:now+1,data:{...cache.data,claims:undefined}},plan,now).evidence.length,0);
const legacy=JSON.parse(JSON.stringify(cache));delete legacy.data.wages;delete legacy.data.claims;
assert.deepEqual(readCache(JSON.stringify(legacy)),legacy);
const oldPlan={...plan};delete oldPlan.targetMonth;
assert(parseBackup({version:1,plan:oldPlan,cache:legacy,history:[]}));
assert.throws(()=>createSnapshot(legacy,oldPlan,now),/bulan target/);
const oldSnapshot={id:'legacy',createdAt:now,plan:oldPlan,cache:legacy,review:{title:'Legacy',note:'Saved',evidence:[],gaps:[]}};
assert.deepEqual(readHistory(JSON.stringify([oldSnapshot])),[oldSnapshot]);
const snapshot=createSnapshot(cache,plan,now);
assert.deepEqual(parseBackup({version:1,plan,cache,history:[snapshot]}).history[0],snapshot);
const originalFetch=global.fetch;
global.fetch=async(url)=>url.includes('ICSA') ? {ok:true,text:async()=>csv} : {ok:false,status:503};
(async()=>{
 const claims=await fetchClaimsData();
 assert.equal(claims.initial.status,'available');
 assert.equal(claims.continued.status,'unavailable');
 assert.equal(claims.initial.points.length,4);
 assert.deepEqual(claims.continued.points,[]);
 global.fetch=originalFetch;
 console.log('Passed: claims CSV/units/4-week gaps, partial source failure, wages growth, target month, cutoff exclusion and legacy backup compatibility.');
})().catch(e=>{global.fetch=originalFetch;console.error(e);process.exitCode=1});
