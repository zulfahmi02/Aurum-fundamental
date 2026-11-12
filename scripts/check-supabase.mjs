import { existsSync, readFileSync } from 'node:fs';

const local = {};
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(EXPO_PUBLIC_SUPABASE_[A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match) local[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? local.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? local.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function main() {
  if (!url || !key) throw new Error('Isi URL dan publishable key di .env.local terlebih dahulu.');
  const headers = { apikey: key };
  const health = await fetch(`${url}/auth/v1/health`, { headers, signal: AbortSignal.timeout(15000) });
  if (!health.ok) throw new Error(`Koneksi Auth gagal (HTTP ${health.status}). Periksa project dan konfigurasi.`);
  console.log('OK: project Supabase merespons.');
  const response = await fetch(`${url}/rest/v1/aurum_backups?select=id&limit=1`, { headers, signal: AbortSignal.timeout(15000) });
  const result = await response.json().catch(() => ({}));
  if (result.code === 'PGRST205') throw new Error('Tabel cadangan belum tersedia. Jalankan supabase/migrations/202611110001_backups.sql di SQL Editor.');
  if (result.code === '42501') {
    console.log('OK: tabel cadangan menolak akses tanpa login.');
    console.log('Selanjutnya uji login, backup, restore, dan isolasi dua akun di aplikasi. Pemeriksaan ini tidak membuktikan RLS antar akun.');
    return;
  }
  if (response.ok) throw new Error('Akses SELECT tanpa login belum ditolak pada tingkat privilege. Periksa migrasi dan grants sebelum memakai cadangan.');
  throw new Error(`Pemeriksaan tabel belum berhasil (HTTP ${response.status}, ${result.code ?? 'tanpa kode'}).`);
}
main().catch(error => {
  // Do not print response bodies, environment values or tokens.
  console.error(error instanceof Error ? error.message : 'Pemeriksaan gagal.');
  process.exitCode = 1;
});
