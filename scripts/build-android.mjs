import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { assertFreeAndroidBuild } from './build-policy.mjs';

// Cloud only: never launch Gradle or an emulator on this laptop.
const env = { ...process.env, EAS_SKIP_AUTO_FINGERPRINT: '1' };
const keys = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
let raw = '';
try { raw = readFileSync('.env.local', 'utf8'); } catch { /* Existing process environment may supply the values. */ }
for (const key of keys) {
  const match = raw.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'));
  if (!env[key] && match) env[key] = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!env[key]) throw new Error(`Missing public configuration: ${key}. Fill .env.local before building.`);
}
const account = JSON.parse(readFileSync('app.json', 'utf8')).expo.owner;
if (!account) throw new Error('Project EAS belum memiliki owner.');
function eas(args) {
  const result = spawnSync('npx', ['eas-cli@latest', ...args], { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    let message = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
    for (const key of keys) message = message.replaceAll(env[key], '[public configuration redacted]');
    throw new Error(message || 'Perintah EAS gagal.');
  }
  return result.stdout;
}
console.log('Memeriksa paket dan kuota gratis EAS…');
const usage = JSON.parse(eas(['account:usage', account, '--json', '--non-interactive']));
assertFreeAndroidBuild(usage, account);
console.log(`Kuota gratis Android: ${usage.builds.android.plan.used}/${usage.builds.android.plan.limit} terpakai.`);
for (const key of keys) {
  eas(['env:set', 'preview', '--scope', 'project', '--name', key, '--value', env[key], '--visibility', 'plaintext', '--non-interactive']);
  console.log(`Konfigurasi publik cloud siap: ${key}`);
}
console.log('Mengirim project ke EAS cloud. Tidak menjalankan build Android lokal…');
const builds = JSON.parse(eas(['build', '--platform', 'android', '--profile', 'preview', '--non-interactive', '--no-wait', '--json']));
if (!Array.isArray(builds) || !builds.length) throw new Error('EAS tidak mengembalikan ID build. Periksa dashboard sebelum mencoba ulang.');
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/eas-build.json', JSON.stringify(builds, null, 2) + '\n');
for (const build of builds) console.log(`Build ${build.id}: https://expo.dev/accounts/${account}/projects/aurum-fundamental/builds/${build.id}`);
