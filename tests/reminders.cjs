const assert = require('node:assert/strict');
const { autoReminderPlan, AUTO_REMINDER_PREFIX } = require('../.test-build/reminderPlan.js');
const release = Date.parse('2026-11-13T13:30:00Z'); // 20.30 WIB
const ppi = { id: `PPI-${release}`, kind: 'PPI', release };
const fomc = { id: 'FOMC-1', kind: 'FOMC', release: Date.parse('2026-12-16T19:00:00Z') }; // 02.00 WIB next day

const plan = autoReminderPlan([fomc, ppi], release - 6 * 3600000);
assert.deepEqual(plan.map(p => p.id), [`aurum-auto-${ppi.id}-prepare`, `aurum-auto-${ppi.id}-check`, 'aurum-auto-FOMC-1-prepare', 'aurum-auto-FOMC-1-check']);
assert.ok(plan.every(p => p.id.startsWith(AUTO_REMINDER_PREFIX)));
assert.deepEqual(plan.slice(0, 2).map(p => p.at), [release - 5 * 3600000, release - 15 * 60000]);
assert.equal(plan[0].title, 'PPI hari ini pukul 20.30 WIB');
assert.match(plan[1].body, /sekitar 20\.20 WIB\. Batas entry 20\.25 WIB/);
assert.equal(plan[2].title, 'FOMC hari ini pukul 02.00 WIB'); // WIB date rollover
// Past reminders are never scheduled; identifiers are stable so a repeated sync adds nothing.
assert.deepEqual(autoReminderPlan([ppi], release - 5 * 3600000).map(p => p.id), [`aurum-auto-${ppi.id}-check`]);
assert.deepEqual(autoReminderPlan([ppi], release - 15 * 60000), []);
assert.deepEqual(autoReminderPlan([ppi], release + 1), []);
assert.deepEqual(autoReminderPlan([{ id: 'x', kind: 'CPI', release: NaN }], 0), []);
assert.deepEqual(autoReminderPlan([ppi], release - 6 * 3600000), autoReminderPlan([ppi], release - 6 * 3600000));
console.log('reminders: ok');
