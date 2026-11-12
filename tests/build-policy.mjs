import assert from 'node:assert/strict';
import { assertFreeAndroidBuild } from '../scripts/build-policy.mjs';
const valid = { account: { name: 'fixture', plan: 'Free' }, builds: { plan: { used: 2, limit: 30 }, android: { plan: { used: 2, limit: 15 } } } };
assert.doesNotThrow(() => assertFreeAndroidBuild(valid, 'fixture'));
for (const bad of [null, {}, { ...valid, account: { name: 'fixture', plan: 'Starter' } },
  { ...valid, builds: { ...valid.builds, android: { plan: { used: 15, limit: 15 } } } },
  { ...valid, builds: { ...valid.builds, plan: { used: 30, limit: 30 } } },
  { ...valid, builds: { ...valid.builds, android: { plan: { used: '2', limit: 15 } } } },
]) assert.throws(() => assertFreeAndroidBuild(bad, 'fixture'));
assert.throws(() => assertFreeAndroidBuild(valid, 'another-account'));
console.log('Passed: cloud build fails closed for unknown/paid accounts, unknown quotas, and exhausted free quotas.');
