const assert = require('node:assert/strict');
const { payrollChanges, monthly, changes, levels, parseWib, phase, SERIES } = require('../.test-build/fundamentals.js');

assert.deepEqual(payrollChanges([
 {year:'2026',period:'M03',value:'1,300'},
 {year:'2026',period:'M01',value:'1,000'},
 {year:'2026',period:'M02',value:'1,200'},
 {year:'2026',period:'M13',value:'9999'},
 {year:'2026',period:'M05',value:'1,400'},
]), [{period:'2026-03',change:100},{period:'2026-02',change:200}]);

// Year boundary counts as consecutive; non-numeric values are dropped.
const points = monthly([
 {year:'2025',period:'M12',value:'100'},
 {year:'2026',period:'M01',value:'102'},
 {year:'2026',period:'M02',value:'-'},
 {year:'2026',period:'M03',value:'104.04'},
]);
assert.deepEqual(points, [{period:'2025-12',value:100},{period:'2026-01',value:102},{period:'2026-03',value:104.04}]);
assert.deepEqual(changes(points, 'pct'), [{period:'2026-01',value:2}]);
assert.deepEqual(changes(points, 'diff'), [{period:'2026-01',value:2}]);
assert.deepEqual(levels(points), [{period:'2026-03',value:104.04},{period:'2026-01',value:102},{period:'2025-12',value:100}]);

// Only the latest six are kept.
const long = monthly(Array.from({length:10},(_,i)=>({year:'2025',period:`M${String(i+1).padStart(2,'0')}`,value:String(i)})));
assert.equal(levels(long).length, 6);
assert.equal(changes(long,'diff').length, 6);
assert.equal(levels(long)[0].period, '2025-10');

assert.equal(Object.keys(SERIES).length, 6);

assert.equal(parseWib('2026-02-30 20:30'), null);
assert.equal(parseWib('2026-12-01 25:00'), null);
assert.equal(parseWib('2026-12-01 20:30'), Date.parse('2026-12-01T13:30:00Z'));
const release = Date.parse('2026-12-01T13:30:00Z');
assert.equal(phase(release, release - 5*3600000), 'Jendela persiapan · T−5 jam');
assert.equal(phase(release, release - 5*60000), 'Jendela entry · T−5 menit');
assert.equal(phase(release, release), 'News sudah dirilis');
console.log('Passed: monthly changes, missing month, annual exclusion, year boundary, pct change, level ordering, cap of six, WIB date validation, phase boundaries.');
