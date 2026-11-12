const assert = require('node:assert/strict');
const { autoReminderPlan, AUTO_REMINDER_PREFIX } = require('../.test-build/reminderPlan.js');
const time = Date.parse;
const release = time('2026-11-13T13:30:00Z'); // 20.30 WIB
const ppi = { id: `PPI-${release}`, kind: 'PPI', release };
const fomc = { id: 'FOMC-1', kind: 'FOMC', release: time('2026-12-16T19:00:00Z') }; // Thu 02.00 WIB

const plan = autoReminderPlan([fomc, ppi], time('2026-11-12T00:00:00Z'));
assert.deepEqual(plan.map(p => p.id), ['morning', 'prepare', 'check'].map(k => `aurum-auto-${ppi.id}-${k}`).concat(['morning', 'prepare', 'check'].map(k => `aurum-auto-FOMC-1-${k}`)));
assert.ok(plan.every(p => p.id.startsWith(AUTO_REMINDER_PREFIX)));
assert.deepEqual(plan.slice(0, 3).map(p => new Date(p.at).toISOString()), ['2026-11-13T00:05:00.000Z', '2026-11-13T08:30:00.000Z', '2026-11-13T13:15:00.000Z']); // 07.05, 15.30, 20.15 WIB
assert.equal(plan[0].title, 'PPI hari ini pukul 20.30 WIB');
assert.equal(plan[1].title, 'PPI 5 jam lagi · 20.30 WIB');
assert.match(plan[2].body, /sekitar 20\.20 WIB\. Batas entry 20\.25 WIB/);
// After-midnight FOMC: reminded on the preceding morning, worded as tomorrow.
assert.equal(new Date(plan[3].at).toISOString(), '2026-12-16T00:05:00.000Z'); // Wed 07.05 WIB
assert.equal(plan[3].title, 'FOMC besok pukul 02.00 WIB');
// Past reminders are never scheduled; identifiers are stable so a repeated sync adds nothing.
assert.deepEqual(autoReminderPlan([ppi], time('2026-11-13T00:05:00Z')).map(p => p.id.split('-').at(-1)), ['prepare', 'check']);
assert.deepEqual(autoReminderPlan([ppi], release - 5 * 3600000).map(p => p.id.split('-').at(-1)), ['check']);
assert.deepEqual(autoReminderPlan([ppi], release - 15 * 60000), []);
assert.deepEqual(autoReminderPlan([{ id: 'x', kind: 'CPI', release: NaN }], 0), []);
console.log('reminders: ok');
