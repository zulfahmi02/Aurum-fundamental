import { supabase } from './supabase';
import { Backup, parseBackup } from './backup';

async function authenticatedClient() {
  if (!supabase) throw new Error('Konfigurasi Supabase belum diisi.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Silakan masuk kembali sebelum mengakses cadangan.');
  return { client: supabase, user: data.user };
}
export async function uploadBackup(backup: Backup): Promise<void> {
  const payload = parseBackup(backup);
  const { client, user } = await authenticatedClient();
  const { error } = await client.from('aurum_backups').insert({ user_id: user.id, payload });
  if (error) throw new Error(`Cadangan belum tersimpan: ${error.message}`);
}
export type RemoteBackup = { id: string; created_at: string };
export async function listBackups(): Promise<RemoteBackup[]> {
  const { client, user } = await authenticatedClient();
  const { data, error } = await client.from('aurum_backups').select('id,created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
  if (error) throw new Error(`Daftar cadangan belum tersedia: ${error.message}`);
  return data ?? [];
}
export async function downloadBackup(id: string): Promise<Backup> {
  const { client, user } = await authenticatedClient();
  const { data, error } = await client.from('aurum_backups').select('payload').eq('user_id', user.id).eq('id', id).single();
  if (error) throw new Error(`Cadangan tidak dapat dibaca: ${error.message}`);
  return parseBackup(data.payload);
}
