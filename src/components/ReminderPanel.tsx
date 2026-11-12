import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { cancelReminders, reconcileReminders, scheduleReminders } from '../reminders';
import type { Plan } from '../review';

export function ReminderPanel({ plan, ready }: { plan: Plan | null; ready: boolean }) {
  const [message, setMessage] = useState(''), [count, setCount] = useState(0), [busy, setBusy] = useState(false);
  const working = useRef(false);
  const release = plan?.release;
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const sync = () => { void reconcileReminders(release).then(n => { if (active) setCount(n); })
      .catch(() => { if (active) setMessage('Pengingat belum dapat diperiksa. Gunakan build Android yang mendukung notifikasi.'); }); };
    sync();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') sync(); });
    return () => { active = false; sub.remove(); };
  }, [release, ready]);
  async function change(enable: boolean) {
    if (working.current || !ready || (enable && !release)) return;
    working.current = true; setBusy(true); setMessage('');
    try {
      const n = enable ? await scheduleReminders(release!) : (await cancelReminders(), 0);
      setCount(n); setMessage(enable ? 'Pengingat dijadwalkan. Jadwal yang sudah lewat tidak diulang.' : 'Pengingat dibatalkan.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Pengingat gagal.'); }
    finally { working.current = false; setBusy(false); }
  }
  return <View style={s.card}>
    <Text style={s.gold}>PENGINGAT ANDROID</Text>
    <Text style={s.text}>{count} pengingat terjadwal. T−5 jam, T−10 menit, T−5 menit, dan T+1 menit.</Text>
    <Text style={s.hint}>Pengingat meminta kamu membuka aplikasi; tidak mengambil data saat aplikasi tertutup. Android dapat menunda notifikasi karena penghematan baterai. Setelah mengubah jadwal rilis, aktifkan kembali.</Text>
    <Pressable style={s.button} disabled={!ready || !plan || busy} onPress={() => { void change(true); }}><Text style={s.gold}>Aktifkan pengingat rencana ini</Text></Pressable>
    <Pressable disabled={!ready || busy} onPress={() => { void change(false); }}><Text style={s.gold}>Batalkan pengingat</Text></Pressable>
    {!!message && <Text accessibilityRole="alert" style={s.text}>{message}</Text>}
  </View>;
}
const s = StyleSheet.create({ card:{backgroundColor:'#131f30',padding:20,borderRadius:18,marginBottom:18,gap:12},gold:{color:'#e7c47c'},text:{color:'#d5deeb',lineHeight:22},hint:{color:'#9eacc0',fontSize:13,lineHeight:21},button:{padding:14,borderWidth:1,borderColor:'#65583f',borderRadius:10} });
