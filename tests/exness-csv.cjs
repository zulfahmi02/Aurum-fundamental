const assert = require('node:assert/strict');
const {ExnessTicks}=require('../.test-build/exnessCsv.js');
const release=Date.parse('2026-11-06T13:30:00Z');
// Synthetic quotes only; field layout follows the official Exness CSV documentation.
const csv='\uFEFF"Exness","Symbol","Timestamp","Bid","Ask"\r\n"Exness","XAUUSDm","2026-11-06 13:24:59.999Z","2000","2001"\r\n"Exness","XAUUSDm","2026-11-06 13:25:00.123Z","2001","2002"\r\n"Exness","XAUUSDm","2026-11-06 13:31:00.456Z","2004","2005"';
const parser=new ExnessTicks(release,'XAUUSDm',0.2);
for(let i=0;i<csv.length;i+=7) parser.push(csv.slice(i,i+7));
const outcome=parser.finish(release+70000);
assert.equal(outcome.entry.bid,2001);
assert.equal(outcome.entry.at,release-300000+123);
assert.equal(outcome.exit.ask,2005);
assert(outcome.feed.includes('indikatif'));
assert.equal(outcome.broker,'Exness');
const short=new ExnessTicks(release,'XAUUSDm',0);
short.push('Symbol,Timestamp,Bid,Ask\nXAUUSDm,2026-11-06T13:25:00Z,2000,2001\nXAUUSDm,2026-11-06T13:31:00Z,2002,2003\n');
assert(short.finish(release+70000));
for(const bad of [
 'XAUUSDm,2026-11-06T13:25:00,2000,2001\n',
 'XAUUSDm,2026-02-30T13:25:00Z,2000,2001\n',
 'XAUUSDm,2026-11-06T13:25:00Z,2002,2001\n',
 'XAUUSDm,2026-11-06T13:25:00Z,,2001\n',
 'XAUUSDm,2026-11-06T13:25:00Z,NaN,2001\n',
]) assert.throws(()=>new ExnessTicks(release,'XAUUSDm',0).push(bad));
const wrong=new ExnessTicks(release,'XAUUSD',0);wrong.push(csv);
assert.throws(()=>wrong.finish(release+70000));
const late=new ExnessTicks(release,'XAUUSDm',0);late.push(csv.replace('13:25:00.123','13:25:06.000'));
assert.throws(()=>late.finish(release+70000));
const reverse=new ExnessTicks(release,'XAUUSDm',0);
assert.throws(()=>reverse.push('XAUUSDm,2026-11-06T13:31:00Z,2000,2001\nXAUUSDm,2026-11-06T13:25:00Z,2000,2001\n'));
assert.throws(()=>new ExnessTicks(release,'XAUUSDm',0).push('a'.repeat(4097)));
console.log('Passed: Exness CSV streaming boundaries, both documented layouts, symbol isolation, UTC timestamps, stale/inverted quotes and indicative provenance.');
