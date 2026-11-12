const assert = require('node:assert/strict');
const { emptyResearch, appendFirstRelease, modelDataset, parseResearch, mergeResearch, validOutcome, quoteResult, FEATURES, validResearchEvent, evaluateJournal } = require('../.test-build/research.js');
const { evaluateResearch, ridgePredict } = require('../.test-build/researchModel.js');
const { forecastNfp } = require('../.test-build/nfpModel.js');
const { createSnapshot } = require('../.test-build/review.js');
const { parseBackup } = require('../.test-build/backup.js');
const { reminderPlan } = require('../.test-build/reminderPlan.js');

// All numeric observations in this file are artificial test fixtures, never app data.
const release = Date.parse('2026-12-04T13:30:00Z');
const first = {period:'2026-11',value:180,publishedAt:release,source:'https://www.bls.gov/news.release/empsit.nr0.htm'};
let research = appendFirstRelease(emptyResearch(),first,release+1000);
assert(!modelDataset(research.releases,release-1).rows.some(r=>r.period==='2026-11'));
assert.equal(modelDataset(research.releases,release+1000).rows.at(-1).value,180);
research = appendFirstRelease(research,{...first,value:190},release+2000);
assert.equal(modelDataset(research.releases,release+1000).rows.at(-1).value,180);
assert.equal(modelDataset(research.releases,release+2000).rows.at(-1).value,190);
assert.throws(()=>appendFirstRelease(research,first,release-1));
assert.throws(()=>appendFirstRelease(research,{...first,source:'https://bls.gov.attacker.test/'},release+1));
const january = { release:Date.parse('2027-01-08T13:30:00Z'),targetMonth:'2026-12',forecast:180,at:release+3000,source:'fixture' };
assert(forecastNfp(january,release+4000,research.releases).forecast);
assert.equal(forecastNfp(january,release+4000).forecast,null);
const imported = mergeResearch(emptyResearch(),research,release+9000);
assert(imported.releases.every(r=>r.recordedAt===release+9000));
assert.throws(()=>mergeResearch(emptyResearch(),research,release-1));

const outcome = {id:'test-outcome',release,broker:'HFM',feed:'demo',symbol:'XAUUSD',entry:{at:release-300000,bid:2000,ask:2001},exit:{at:release+60000,bid:2003,ask:2004},cost:0.5,source:'Synthetic test',recordedAt:release+90000};
assert(validOutcome(outcome));
assert.deepEqual(quoteResult(outcome),{long:1.5,short:-4.5,midChange:3});
for (const invalid of [
  {...outcome,broker:'Other'}, {...outcome,entry:{...outcome.entry,at:release-300001}},
  {...outcome,exit:{...outcome.exit,at:release+65001}}, {...outcome,entry:{...outcome.entry,ask:1999}},
  {...outcome,cost:-1}, {...outcome,recordedAt:release}, {...outcome,feed:'a\nb'},
]) assert(!validOutcome(invalid));

function event(i) {
  const target = new Date(Date.UTC(2020,i,1)).toISOString().slice(0,7);
  const previous = new Date(Date.UTC(2020,i-1,1)).toISOString().slice(0,7);
  const time = Date.UTC(2020,i+1,5,13,30);
  const features = Object.fromEntries(FEATURES.map((k,j)=>[k,{
    value:k==='claims4w'?200000+i*100:k.startsWith('ism')?50+i/100:k==='unemployment'?4:100+i+j,
    period:['nfpMean3','unemployment','wages'].includes(k)?previous:target,
    publishedAt:time-86400000,knownAt:time-3600000,source:'https://example.org/test-fixture',
  }]));
  return {id:`test-${i}`,target,release:time,capturedAt:time+1000,features,
    actual:{id:`actual-${i}`,period:target,value:150+i,publishedAt:time,recordedAt:time+1000,source:first.source}};
}
const events = Array.from({length:30},(_,i)=>event(i));
assert(events.every(validResearchEvent));
const bad = structuredClone(events[0]); bad.features.adp.knownAt=bad.release-299999;
assert(!validResearchEvent(bad));
assert.throws(()=>parseResearch({...emptyResearch(),events:[events[0],events[0]]}));
const dataset = parseResearch({...emptyResearch(),events,outcomes:events.flatMap(e=>[
  {...outcome,id:`h-${e.id}`,release:e.release,entry:{...outcome.entry,at:e.release-300000},exit:{...outcome.exit,at:e.release+60000},recordedAt:e.release+70000},
  {...outcome,id:`e-${e.id}`,broker:'Exness',release:e.release,entry:{...outcome.entry,at:e.release-300000},exit:{at:e.release+60000,bid:1900,ask:1901},recordedAt:e.release+70000},
])});
const report=evaluateResearch(dataset);
assert.equal(report.count,6);
assert.equal(report.brokers.length,2);
assert(report.brokers.every(b=>b.count===6));
assert(report.brokers.find(b=>b.broker==='HFM').predictions.every(p=>p.direction==='BUY'));
assert(report.brokers.find(b=>b.broker==='Exness').predictions.every(p=>p.direction==='SELL'));
const changed=structuredClone(dataset); changed.events.at(-1).actual.value=90000;
assert.deepEqual(evaluateResearch(changed).predictions.slice(0,-1),report.predictions.slice(0,-1));
assert.equal(evaluateResearch(changed).predictions.at(-1).estimate,report.predictions.at(-1).estimate);
const changedQuotes=structuredClone(dataset); changedQuotes.outcomes.at(-2).exit.bid=2200; changedQuotes.outcomes.at(-2).exit.ask=2201;
assert.equal(evaluateResearch(changedQuotes).brokers[0].predictions.at(-1).predictedChange,report.brokers[0].predictions.at(-1).predictedChange);
assert.equal(report.liveReady,false);
assert.equal(evaluateResearch(emptyResearch()).mae,null);
assert.equal(ridgePredict([[1]],[1],[1]),null);
assert.equal(ridgePredict(Array(24).fill([1,1]),Array(24).fill(20),[1,1]),20);

const plan={release,targetMonth:'2026-11',forecast:130,source:'fixture',at:release-3600000};
const cache={version:1,fetchedAt:plan.at,data:{payroll:[],unemployment:[],jolts:[],cpi:[],ppi:[]}};
const one=createSnapshot(cache,plan,plan.at), two=createSnapshot(cache,plan,plan.at+1000);
const journal=evaluateJournal([one,two],{...research,outcomes:[outcome]},'HFM');
assert.equal(journal.length,1); assert.equal(journal[0].snapshot.id,two.id);
assert.equal(journal[0].actual.value,190);
assert.equal(evaluateJournal([one],{...research,outcomes:[outcome]},'Exness')[0].outcomes.length,0);
assert.deepEqual(parseBackup({version:1,plan,cache,history:[one],research}).research,research);
assert.throws(()=>parseBackup({version:1,plan,cache,history:[],research:{version:2}}));
assert.equal(reminderPlan(release,release-6*3600000).length,4);
assert.equal(reminderPlan(release,release-5*3600000).length,3);
assert.equal(reminderPlan(release,release-300000).length,1);
assert.equal(reminderPlan(release,release+60000).length,0);
console.log('Passed: point-in-time release updates, import guards, broker separation, bid/ask costs, no future label leakage, ridge warmup, journal deduplication, backup and reminder boundaries.');
