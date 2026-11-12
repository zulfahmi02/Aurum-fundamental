const assert = require('node:assert/strict');
const { parseBackup, planDate } = require('../.test-build/backup.js');
const { restoreLocal, recoverRestore, RESTORE_KEY, PLAN_KEY } = require('../.test-build/localBackup.js');
const { CACHE_KEY, HISTORY_KEY, readCache } = require('../.test-build/review.js');
const blank = {version:1,plan:null,cache:null,history:[]};
assert.deepEqual(parseBackup(blank), blank);
assert.equal(readCache('null'),null);
assert.throws(()=>parseBackup({version:2,plan:null,cache:null,history:[]}));
assert.throws(()=>parseBackup({version:1,plan:{},cache:null,history:[]}));
assert.throws(()=>parseBackup({version:1,plan:null,cache:null,history:[{}]}));
const plan = {release:Date.parse('2026-12-04T13:30:00Z'),forecast:100,source:'Test',at:Date.parse('2026-12-04T10:00:00Z')};
assert.equal(planDate(plan),'2026-12-04 20:30');
const values = new Map(); let fail=false;
const store = {
 async getItem(k){return values.get(k)??null},
 async setItem(k,v){values.set(k,v)},
 async removeItem(k){values.delete(k)},
 async multiSet(rows){for(const [k,v] of rows){values.set(k,v);if(fail)throw new Error('Storage failure');}},
};
(async()=>{
 await restoreLocal(store,{...blank,plan});
 assert.equal(JSON.parse(values.get(PLAN_KEY)).saved.forecast,100);
 assert.equal(values.has(RESTORE_KEY),false);
 fail=true;
 await assert.rejects(restoreLocal(store,blank),/Storage failure/);
 assert(values.has(RESTORE_KEY));
 fail=false;
 await recoverRestore(store);
 assert.equal(values.get(PLAN_KEY),'null');
 assert.equal(values.get(CACHE_KEY),'null');
 assert.equal(values.get(HISTORY_KEY),'[]');
 assert.equal(values.has(RESTORE_KEY),false);
 const previous=JSON.stringify([...values]);
 await assert.rejects(restoreLocal(store,{version:999}));
 assert.equal(JSON.stringify([...values]),previous);
 console.log('Passed: backup validation, WIB restore, empty backups, partial storage failure and journal recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});
