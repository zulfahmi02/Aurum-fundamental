import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { Backup } from '../backup';
import { downloadBackup, listBackups, RemoteBackup, uploadBackup } from '../cloud';

type Props = { backup: Backup; ready: boolean; canRestore?: boolean; onRestore(value: Backup): Promise<void>; onBusy(value: boolean): void };
export function CloudPanel({ backup, ready, canRestore = ready, onRestore, onBusy }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<RemoteBackup[]>([]);
  const working = useRef(false);
  const account = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let authEvent = false;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEvent) return;
      if (error) setMessage(error.message);
      account.current = data.session?.user.id; setSession(data.session); setAuthReady(true);
    }).catch(() => { if (active) { setAuthReady(true); setMessage('Sesi belum dapat dibaca. Silakan masuk.'); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authEvent = true;
      if (account.current !== next?.user.id) { setItems([]); setMessage(''); }
      account.current = next?.user.id; setSession(next); setAuthReady(true);
    });
    const autoRefresh = (state: string | null | undefined) => {
      if (state === 'active') supabase?.auth.startAutoRefresh(); else supabase?.auth.stopAutoRefresh();
    };
    autoRefresh(AppState.currentState);
    const appState = AppState.addEventListener('change', autoRefresh);
    return () => { active = false; subscription.unsubscribe(); appState.remove(); supabase?.auth.stopAutoRefresh(); };
  }, []);
  async function run(task: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); onBusy(true); setMessage('');
    try { await task(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Koneksi gagal. Coba kembali.'); }
    finally { working.current = false; setBusy(false); onBusy(false); }
  }
  async function login(signup: boolean) {
    if (!email.trim() || !password) { setMessage('Isi email dan password akun aplikasi.'); return; }
    await run(async () => {
      if (!supabase) return;
      const credentials = { email: email.trim(), password };
      const { error } = signup ? await supabase.auth.signUp(credentials) : await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      setPassword('');
      if (signup) setMessage('Jika konfirmasi email diperlukan, buka email lalu masuk kembali di sini.');
    });
  }
  function confirmUpload() {
    Alert.alert('Cadangkan data perangkat?', `Rencana, data BLS/claims, ${backup.manual?.length ?? 0} versi ADP/ISM, ${backup.history.length} catatan, dataset riset/harga broker, serta rencana dan catatan PPI akan dikirim ke akun ${session?.user.email}.`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Cadangkan', onPress: () => { void run(async () => {
        await uploadBackup(backup); setMessage('Cadangan berhasil tersimpan di Supabase.');
      }); } },
    ]);
  }
  function confirmRestore(item: RemoteBackup) {
    Alert.alert('Pulihkan cadangan?', 'Rencana, data BLS/claims, input ADP/ISM, seluruh catatan, dataset riset/harga broker, serta rencana dan catatan PPI di perangkat akan diganti dengan isi cadangan ini. Cadangan lama tanpa dataset riset atau PPI akan mengosongkan bagian tersebut di perangkat. Cadangkan terlebih dahulu jika masih diperlukan.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Pulihkan', onPress: () => { void run(async () => {
        const owner = account.current;
        const restored = await downloadBackup(item.id);
        if (!owner || owner !== account.current) throw new Error('Akun berubah. Ulangi pemulihan.');
        await onRestore(restored); setMessage('Cadangan berhasil dipulihkan ke perangkat.');
      }); } },
    ]);
  }
  return <View style={s.card}>
    <Text style={s.title}>SUPABASE / CADANGAN PRIBADI</Text>
    {!supabase ? <Text style={s.text}>Koneksi belum diatur. Isi konfigurasi Supabase untuk mengaktifkan cadangan online.</Text> : !authReady ? <ActivityIndicator color="#e7c47c" /> : session ? <>
      <Text style={s.text}>Masuk sebagai {session.user.email}</Text>
      <Text style={s.hint}>Pencadangan manual. Data perangkat tetap ada setelah keluar akun.</Text>
      <Pressable style={s.button} disabled={busy || !ready} onPress={confirmUpload}><Text style={s.gold}>Cadangkan data perangkat</Text></Pressable>
      <Pressable style={s.button} disabled={busy} onPress={() => { void run(async () => {
        const owner = account.current;
        const list = await listBackups();
        if (owner !== account.current) return;
        setItems(list); setMessage(list.length ? 'Menampilkan maksimal 10 cadangan terbaru.' : 'Belum ada cadangan pada akun ini.');
      }); }}><Text style={s.gold}>Lihat cadangan online</Text></Pressable>
      {items.map(item => <Pressable key={item.id} disabled={busy || !canRestore} style={s.button} onPress={() => confirmRestore(item)}>
        <Text style={s.text}>{new Date(item.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</Text><Text style={s.gold}>Pulihkan ke perangkat</Text>
      </Pressable>)}
      <Pressable disabled={busy} onPress={() => { void run(async () => { const result = await supabase!.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; }); }}><Text style={s.gold}>Keluar akun</Text></Pressable>
    </> : <>
      <Text style={s.hint}>Gunakan akun aplikasi Supabase Auth, bukan password dashboard Supabase.</Text>
      <TextInput accessibilityLabel="Email akun aplikasi" style={s.input} placeholder="Email" placeholderTextColor="#9eacc0" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} />
      <TextInput accessibilityLabel="Password akun aplikasi" style={s.input} placeholder="Password" placeholderTextColor="#9eacc0" autoCapitalize="none" secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable style={s.button} disabled={busy} onPress={() => { void login(false); }}><Text style={s.gold}>Masuk</Text></Pressable>
      <Pressable disabled={busy} onPress={() => { void login(true); }}><Text style={s.gold}>Buat akun aplikasi</Text></Pressable>
    </>}
    {busy && <ActivityIndicator color="#e7c47c" />}
    {!!message && <Text accessibilityRole="alert" style={s.text}>{message}</Text>}
  </View>;
}
const s = StyleSheet.create({
  card:{backgroundColor:'#131f30',borderColor:'#253247',borderWidth:1,borderRadius:18,padding:20,marginBottom:18,gap:12},
  title:{color:'#e7c47c',fontSize:11,fontWeight:'700',letterSpacing:1.5},text:{color:'#d5deeb',fontSize:14,lineHeight:22},hint:{color:'#9eacc0',fontSize:13,lineHeight:21},gold:{color:'#e7c47c',fontWeight:'600'},
  input:{backgroundColor:'#0c1421',borderColor:'#344157',borderWidth:1,borderRadius:9,padding:13,color:'#fff',fontSize:15},button:{borderWidth:1,borderColor:'#65583f',padding:14,borderRadius:10,gap:6},
});
