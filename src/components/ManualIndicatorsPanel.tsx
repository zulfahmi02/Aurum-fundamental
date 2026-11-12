import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseWib } from '../fundamentals';
import { MANUAL_TYPES, ManualInput, ManualKind, ManualObservation } from '../manual';

type Props = { records: ManualObservation[]; disabled: boolean; target?: string; onSave(value: ManualInput): Promise<void> };
export function ManualIndicatorsPanel({ records, disabled, target, onSave }: Props) {
  const [kind, setKind] = useState<ManualKind>('adp');
  const [period, setPeriod] = useState('');
  const [value, setValue] = useState('');
  const [published, setPublished] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const working = useRef(false);
  const selected = MANUAL_TYPES[kind];
  const open = (source: string) => Linking.openURL(source).catch(() => Alert.alert('Tautan gagal dibuka', source));
  async function save() {
    if (disabled || working.current) return;
    const publishedAt = parseWib(published);
    const number = Number(value.replace(',', '.'));
    if (publishedAt === null || !/^-?\d+(?:[.,]\d+)?$/.test(value.trim()) || !Number.isFinite(number)) {
      Alert.alert('Periksa input', 'Isi nilai tanpa pemisah ribuan dan waktu rilis YYYY-MM-DD HH:mm dalam WIB.'); return;
    }
    working.current = true; setBusy(true);
    try {
      await onSave({ kind, period: period.trim(), value: number, publishedAt, sourceUrl: url.trim() });
      setValue('');
      Alert.alert('Tersimpan', 'Versi baru dicatat. Catatan persiapan lama tidak berubah.');
    } catch (e) { Alert.alert('Belum tersimpan', e instanceof Error ? e.message : 'Penyimpanan gagal.'); }
    finally { working.current = false; setBusy(false); }
  }
  return <View style={s.card}>
    <Text style={s.title}>ADP & ISM / INPUT LAPORAN RESMI</Text>
    <Text style={s.muted}>Pilih data bulanan. Untuk ADP gunakan perubahan pekerjaan swasta dalam ribu, bukan NER Pulse mingguan. Untuk ISM gunakan Employment Index, bukan headline PMI.</Text>
    <View style={s.choices}>{(Object.keys(MANUAL_TYPES) as ManualKind[]).map(k => <Pressable key={k} disabled={disabled || busy} accessibilityRole="radio" accessibilityState={{ checked: kind === k }} style={[s.choice, k === kind && s.active]} onPress={() => { setKind(k); setValue(''); setUrl(''); }}><Text style={s.gold}>{k === 'adp' ? 'ADP' : k === 'ismManufacturing' ? 'ISM manufaktur' : 'ISM jasa'}</Text></Pressable>)}</View>
    <Pressable onPress={() => { void open(selected.url); }}><Text style={s.gold}>Buka sumber resmi ↗</Text></Pressable>
    <Text style={s.label}>Bulan data · YYYY-MM</Text><TextInput accessibilityLabel="Bulan data ADP atau ISM" editable={!disabled && !busy} style={s.input} placeholder="YYYY-MM" placeholderTextColor="#9eacc0" value={period} onChangeText={setPeriod} />
    {target && <Pressable disabled={disabled || busy} onPress={() => setPeriod(target)}><Text style={s.gold}>Gunakan target NFP: {target}</Text></Pressable>}
    <Text style={s.label}>Nilai · {selected.unit}</Text><TextInput accessibilityLabel="Nilai indikator manual" editable={!disabled && !busy} style={s.input} keyboardType="numbers-and-punctuation" placeholder={kind === 'adp' ? 'Contoh format: -25 atau 150' : 'Contoh format: 49,5'} placeholderTextColor="#9eacc0" value={value} onChangeText={setValue} />
    <Text style={s.label}>Waktu rilis versi ini · WIB</Text><TextInput accessibilityLabel="Waktu rilis indikator manual WIB" editable={!disabled && !busy} style={s.input} placeholder="YYYY-MM-DD HH:mm" placeholderTextColor="#9eacc0" value={published} onChangeText={setPublished} />
    <Text style={s.label}>URL laporan resmi</Text><TextInput accessibilityLabel="URL laporan resmi ADP atau ISM" editable={!disabled && !busy} style={s.input} placeholder="https://…" placeholderTextColor="#9eacc0" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={url} onChangeText={setUrl} />
    <Pressable style={[s.button, (disabled || busy) && s.disabled]} disabled={disabled || busy} onPress={() => { void save(); }}><Text style={s.gold}>{busy ? 'Menyimpan…' : 'Simpan versi data'}</Text></Pressable>
    <Text style={s.muted}>Koreksi angka dengan menyimpan versi baru. Waktu pencatatan selalu waktu saat ini; memasukkan tanggal rilis lama tidak membuat data seolah sudah diketahui sebelumnya.</Text>
    <Pressable onPress={() => setShowHistory(!showHistory)}><Text style={s.gold}>{showHistory ? 'Tutup' : 'Lihat'} riwayat input ({records.length})</Text></Pressable>
    {showHistory && records.slice(0, 20).map(row => <View key={row.id} style={s.record}>
      <Text style={s.text}>{MANUAL_TYPES[row.kind].label} · {row.period}</Text>
      <Text style={s.text}>{row.value.toLocaleString('id-ID')} {MANUAL_TYPES[row.kind].unit}</Text>
      <Text style={s.muted}>Dicatat: {new Date(row.recordedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</Text>
      <Pressable onPress={() => { void open(row.sourceUrl); }}><Text style={s.gold}>Laporan sumber ↗</Text></Pressable>
    </View>)}
    {showHistory && records.length > 20 && <Text style={s.muted}>Menampilkan 20 versi terbaru; semua versi tetap tersimpan.</Text>}
  </View>;
}
const s = StyleSheet.create({
  card:{backgroundColor:'#131f30',borderColor:'#253247',borderWidth:1,borderRadius:18,padding:20,marginBottom:18,gap:12},title:{color:'#e7c47c',fontSize:11,fontWeight:'700',letterSpacing:1.5},
  muted:{color:'#9eacc0',fontSize:13,lineHeight:21},text:{color:'#d5deeb',fontSize:14,lineHeight:23},gold:{color:'#e7c47c',fontSize:13,lineHeight:20},label:{color:'#c6d0df',fontSize:12},
  input:{backgroundColor:'#0c1421',borderColor:'#344157',borderWidth:1,borderRadius:9,padding:13,color:'#fff',fontSize:15},button:{borderWidth:1,borderColor:'#65583f',padding:14,borderRadius:10,alignItems:'center'},
  choices:{flexDirection:'row',flexWrap:'wrap',gap:8},choice:{padding:9,borderRadius:8,backgroundColor:'#192437'},active:{backgroundColor:'#403625'},disabled:{opacity:0.4},record:{padding:12,backgroundColor:'#0c1421',gap:6,borderRadius:9},
});
