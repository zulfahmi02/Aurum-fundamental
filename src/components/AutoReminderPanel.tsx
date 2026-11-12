import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewsEvent } from '../automatic';
import { cancelAutoReminders, syncAutoReminders } from '../reminders';

const KEY = 'aurum-auto-reminders-v1';
export function AutoReminderPanel({ events }: { events: NewsEvent[] | null }) {
  // null: preference not loaded yet. Nothing is scheduled or cancelled until it is known.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [count, setCount] = useState(0), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const working = useRef(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY).then(v => { if (active) setEnabled(v === '1'); }).catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!enabled || !events) return;
    let active = true;
    const sync = () => { void syncAutoReminders(events).then(n => { if (active) { setCount(n); setMessage(''); } })
      .catch(e => { if (active) setMessage(e instanceof Error ? e.message : 'Pengingat belum dapat dijadwalkan.'); }); };
    sync();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') sync(); });
    return () => { active = false; sub.remove(); };
  }, [enabled, events]);
  async function change(enable: boolean) {
    if (working.current || enabled === null) return;
    working.current = true; setBusy(true); setMessage('');
    try {
      if (enable) {
        const n = await syncAutoReminders(events ?? [], true);
        await AsyncStorage.setItem(KEY, '1');
        setCount(n); setEnabled(true);
      } else {
        await AsyncStorage.removeItem(KEY);
        setEnabled(false); setCount(0);
        await cancelAutoReminders();
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Pengingat gagal diubah.'); }
    finally { working.current = false; setBusy(false); }
  }
  return <View style={s.box}>
    <Text style={s.gold}>Pengingat news otomatis</Text>
    <Text style={s.text}>{enabled ? `Aktif · ${count} pengingat terjadwal untuk kalender minggu ini.` : 'Belum aktif.'} Dikirim pagi 07.05 WIB, T−5 jam, dan T−15 menit sebelum NFP, CPI, PPI, dan FOMC.</Text>
    <Text style={s.muted}>Pengingat hanya mengajak membuka aplikasi dan tidak memuat bias. Jadwal diperbarui setiap aplikasi dibuka; buka aplikasi minimal sekali seminggu agar news minggu itu terjadwal. Android dapat menunda notifikasi beberapa menit.</Text>
    <Pressable accessibilityRole="button" disabled={busy || enabled === null} style={s.button} onPress={() => { void change(!enabled); }}>
      <Text style={s.gold}>{enabled ? 'Matikan pengingat otomatis' : 'Aktifkan pengingat otomatis'}</Text>
    </Pressable>
    {!!message && <Text accessibilityRole="alert" style={s.warning}>{message}</Text>}
  </View>;
}
const s = StyleSheet.create({
  box: { padding: 14, backgroundColor: '#0c1421', borderRadius: 10, gap: 10 }, gold: { color: '#e7c47c', fontWeight: '600' },
  text: { color: '#d5deeb', lineHeight: 23 }, muted: { color: '#9eacc0', fontSize: 13, lineHeight: 21 }, warning: { color: '#ffcf9c', fontSize: 13, lineHeight: 21 },
  button: { padding: 14, borderWidth: 1, borderColor: '#65583f', borderRadius: 10, alignItems: 'center' },
});
