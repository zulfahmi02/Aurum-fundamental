import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchFundamentals, parseWib, phase, Fundamentals, Point } from './src/fundamentals';
import { CACHE_KEY, HISTORY_KEY, Cache, Plan, Snapshot, readCache, readHistory, validPlan, reviewFundamentals, createSnapshot } from './src/review';

import { Backup, planDate } from './src/backup';
import { PLAN_KEY as STORAGE, recoverRestore, restoreLocal } from './src/localBackup';
import { CloudPanel } from './src/components/CloudPanel';
import { ClaimsPanel } from './src/components/ClaimsPanel';
import { MANUAL_KEY, ManualInput, ManualObservation, appendManual, readManual } from './src/manual';
import { ManualIndicatorsPanel } from './src/components/ManualIndicatorsPanel';
import { validTargetMonth } from './src/periods';
import { NfpForecastDetails, NfpModelPanel } from './src/components/NfpModelPanel';
import { ResearchPanel } from './src/components/ResearchPanel';
import { ReminderPanel } from './src/components/ReminderPanel';
import { PpiPanel } from './src/components/PpiPanel';
import { AutomaticPanel } from './src/components/AutomaticPanel';
import { PPI_KEY, PpiState, emptyPpi, parsePpi, readPpi } from './src/ppiModel';
import { FirstRelease, RESEARCH_KEY, Research, appendFirstRelease, emptyResearch, mergeResearch, readResearch } from './src/research';
const latest = (points: Point[], render: (v: number) => string) => points[0] ? `${render(points[0].value)} · ${points[0].period}` : 'belum tersedia';
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
const support = (d: Fundamentals) => [
  { label: 'Tingkat pengangguran', text: latest(d.unemployment, v => `${v.toLocaleString('id-ID')}%`) },
  { label: 'Lowongan kerja JOLTS', text: latest(d.jolts, v => `${v.toLocaleString('id-ID')} ribu`) },
  { label: 'CPI m/m', text: latest(d.cpi, pct) },
  { label: 'Upah per jam m/m', text: latest(d.wages ?? [], pct) },
  { label: 'PPI m/m', text: latest(d.ppi, pct) },
];
const fmt = (time: number) => new Date(time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
export default function App() {
  const [showResearch, setShowResearch] = useState(false);
  const [ppi, setPpi] = useState<PpiState>(emptyPpi);
  const [ppiReady, setPpiReady] = useState(false);
  const [ppiError, setPpiError] = useState('');
  const [ppiBusy, setPpiBusy] = useState(false);
  const [ppiEpoch, setPpiEpoch] = useState(0);
  const ppiWrite = useRef(false);
  const [research, setResearch] = useState<Research>(emptyResearch);
  const [researchReady, setResearchReady] = useState(false);
  const [researchError, setResearchError] = useState('');
  const [researchBusy, setResearchBusy] = useState(false);
  const researchWrite = useRef(false);
  const [manual, setManual] = useState<ManualObservation[]>([]);
  const [manualReady, setManualReady] = useState(false);
  const [manualError, setManualError] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const manualWrite = useRef(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const planWrite = useRef(false);
  const [cache, setCache] = useState<Cache | null>(null);
  const data = cache?.data ?? null;
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const refreshing = useRef(false);
  const savingSnapshot = useRef(false);
  const [cacheError, setCacheError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const updated = cache?.fetchedAt;
  const [date, setDate] = useState('');
  const [targetMonth, setTargetMonth] = useState('');
  const [forecast, setForecast] = useState('');
  const [source, setSource] = useState('');
  const [saved, setSaved] = useState<Plan | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const review = reviewFundamentals(cache, saved, now, manual);
  const canRecord = !!saved?.targetMonth && !!cache && historyReady && cacheReady && manualReady && researchReady && !researchBusy && !savingManual && now >= saved.release - 5 * 3600000 && now <= saved.release - 5 * 60000;
  useEffect(() => {
    recoverRestore(AsyncStorage).then(async () => {
      await Promise.allSettled([
        AsyncStorage.getItem(PPI_KEY).then(value => { setPpi(readPpi(value)); setPpiReady(true); })
          .catch(() => setPpiError('Data PPI tidak dapat dibaca. Penyimpanan PPI dan backup dinonaktifkan agar data tidak tertimpa. Pulihkan cadangan yang valid.')),
        AsyncStorage.getItem(RESEARCH_KEY).then(value => { setResearch(readResearch(value)); setResearchReady(true); })
          .catch(() => setResearchError('Dataset riset tidak dapat dibaca. Penyimpanan dinonaktifkan agar data tidak tertimpa.')),
        AsyncStorage.getItem(MANUAL_KEY).then(value => { setManual(readManual(value)); setManualReady(true); })
          .catch(() => setManualError('Data ADP/ISM tidak dapat dibaca. Pencatatan dan backup dinonaktifkan agar data lama tidak tertimpa.')),
        AsyncStorage.getItem(STORAGE).then(value => {
          const v = value ? JSON.parse(value) : null;
          if (v) {
            if (typeof v.date !== 'string' || parseWib(v.date) === null || !validPlan(v.saved) || parseWib(v.date) !== v.saved.release) throw new Error();
            setDate(v.date); setTargetMonth(v.saved.targetMonth ?? ''); setForecast(String(v.saved.forecast)); setSource(v.saved.source); setSaved(v.saved);
          }
        }).catch(() => setError('Rencana tersimpan tidak dapat dibaca. Silakan isi ulang.')).finally(() => setReady(true)),
        AsyncStorage.getItem(CACHE_KEY).then(value => setCache(readCache(value)))
          .catch(() => setCacheError('Data tersimpan tidak dapat dibaca. Ambil ulang dari BLS.')).finally(() => setCacheReady(true)),
        AsyncStorage.getItem(HISTORY_KEY).then(value => { setHistory(readHistory(value)); setHistoryReady(true); })
          .catch(() => setHistoryError('Riwayat tidak dapat dibaca. Penyimpanan catatan dinonaktifkan agar data lama tidak tertimpa.')),
      ]);
    }).catch(() => setError('Pemulihan lokal belum selesai. Tutup dan buka kembali aplikasi sebelum mengubah data.'));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function refresh() {
    if (refreshing.current || !cacheReady || cloudBusy) return;
    refreshing.current = true;
    setLoading(true); setError('');
    try {
      const next: Cache = { version: 1, data: await fetchFundamentals(), fetchedAt: Date.now() };
      setCache(next);
      try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)); setCacheError(''); }
      catch { setError('Data berhasil diambil tetapi gagal disimpan di perangkat. Coba ambil ulang.'); }
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Koneksi gagal. Coba lagi.'); }
    finally { refreshing.current = false; setLoading(false); }
  }
  async function save() {
    if (!ready || cloudBusy || planWrite.current) return;
    const release = parseWib(date);
    const number = Number(forecast.replace(',', '.'));
    if (!release || release <= Date.now() || !forecast.trim() || !Number.isFinite(number) || !source.trim() || !validTargetMonth(targetMonth, release)) {
      Alert.alert('Periksa rencana', 'Isi tanggal mendatang dalam format YYYY-MM-DD HH:mm (WIB), konsensus numerik dalam ribu pekerjaan, sumber konsensus, serta bulan target YYYY-MM sebelum bulan rilis.'); return;
    }
    planWrite.current = true; setSavingPlan(true);
    const plan = { release, targetMonth, forecast: number, source: source.trim(), at: Date.now() };
    try { await AsyncStorage.setItem(STORAGE, JSON.stringify({ date, saved: plan })); setSaved(plan); Alert.alert('Tersimpan', 'Rencana tersedia kembali saat aplikasi dibuka.'); }
    catch { Alert.alert('Gagal menyimpan', 'Coba simpan kembali.'); }
    finally { planWrite.current = false; setSavingPlan(false); }
  }
  async function recordReview() {
    if (!cache || !saved || !historyReady || !manualReady || !researchReady || researchBusy || manualWrite.current || savingSnapshot.current || cloudBusy) return;
    savingSnapshot.current = true; setSavingReview(true);
    try {
      const snapshot = createSnapshot(cache, saved, Date.now(), manual, research.releases);
      const next = [snapshot, ...history];
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      setHistory(next);
      Alert.alert('Catatan tersimpan', 'Data, konsensus, ringkasan, dan estimasi NFP jika tersedia disimpan sebagai salinan tetap.');
    } catch (e) { Alert.alert('Catatan belum tersimpan', e instanceof Error ? e.message : 'Penyimpanan gagal.'); }
    finally { savingSnapshot.current = false; setSavingReview(false); }
  }
  async function saveManual(input: ManualInput) {
    if (!manualReady || cloudBusy || manualWrite.current) throw new Error('Tunggu sampai penyimpanan siap.');
    manualWrite.current = true; setSavingManual(true);
    try {
      const next = appendManual(manual, input, Date.now());
      await AsyncStorage.setItem(MANUAL_KEY, JSON.stringify(next));
      setManual(next); setManualError('');
    } finally { manualWrite.current = false; setSavingManual(false); }
  }
  async function updateResearch(change: (current: Research) => Research) {
    if (!researchReady || cloudBusy || researchWrite.current) throw new Error('Penyimpanan belum siap.');
    researchWrite.current = true;
    try {
      const current = readResearch(await AsyncStorage.getItem(RESEARCH_KEY));
      const next = change(current);
      await AsyncStorage.setItem(RESEARCH_KEY, JSON.stringify(next));
      setResearch(next); setResearchError('');
    } finally { researchWrite.current = false; }
  }
  async function saveRelease(input: Omit<FirstRelease, 'id' | 'recordedAt'>) {
    await updateResearch(current => appendFirstRelease(current, input, Date.now()));
  }
  async function importResearch(value: unknown) {
    await updateResearch(current => mergeResearch(current, value, Date.now()));
  }
  async function restoreBackup(value: Backup) {
    try { await restoreLocal(AsyncStorage, value); }
    catch {
      setReady(false); setCacheReady(false); setHistoryReady(false); setManualReady(false); setResearchReady(false);
      setPpiReady(false);
      throw new Error('Pemulihan tertunda. Tutup dan buka kembali aplikasi untuk melanjutkan pemulihan lokal.');
    }
    setManual(value.manual ?? []); setManualError('');
    setResearch(value.research ?? emptyResearch()); setResearchError('');
    setPpi(value.ppi ?? emptyPpi()); setPpiError(''); setPpiReady(true); setPpiEpoch(v => v + 1);
    setReady(true); setCacheReady(true); setHistoryReady(true); setManualReady(true); setResearchReady(true);
    setCache(value.cache); setHistory(value.history); setSaved(value.plan);
    setDate(value.plan ? planDate(value.plan) : ''); setTargetMonth(value.plan?.targetMonth ?? '');
    setForecast(value.plan ? String(value.plan.forecast) : ''); setSource(value.plan?.source ?? '');
    setExpanded(null); setError(''); setCacheError(''); setHistoryError('');
  }
  async function updatePpi(change: (current: PpiState) => PpiState) {
    if (!ppiReady || cloudBusy || ppiWrite.current) throw new Error('Penyimpanan PPI belum siap.');
    ppiWrite.current = true; setPpiBusy(true);
    try {
      const current = readPpi(await AsyncStorage.getItem(PPI_KEY));
      const next = parsePpi(change(current));
      await AsyncStorage.setItem(PPI_KEY, JSON.stringify(next));
      setPpi(next); setPpiError('');
    } finally { ppiWrite.current = false; setPpiBusy(false); }
  }
  const link = (url: string) => Linking.openURL(url).catch(() => Alert.alert('Tautan gagal dibuka', url));
  return <View style={s.screen}><StatusBar style="light" /><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.eyebrow}>AURUM / FUNDAMENTAL DESK</Text>
    <Text style={s.title}>Kenali datanya.{'\n'}Pahami alasannya.</Text>
    <Text style={s.muted}>XAUUSD · Android · Sumber gratis</Text>
    <View style={s.tags}>{['NFP', 'PPI', 'CPI', 'FOMC'].map(x => <Text key={x} style={s.tag}>{x}</Text>)}</View>
    <AutomaticPanel now={now} />
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showResearch }} style={s.outline} onPress={() => setShowResearch(v => !v)}><Text style={s.accent}>{showResearch ? 'Tutup koreksi dan riset manual' : 'Koreksi dan riset manual (opsional)'}</Text></Pressable>
    {showResearch && <>
    {!!ppiError && <Text accessibilityRole="alert" style={s.error}>{ppiError}</Text>}
    <PpiPanel key={`${ppiEpoch}-${ppiReady}`} state={ppi} now={now} ready={ppiReady} disabled={cloudBusy || ppiBusy} onChange={updatePpi} />
    <View style={s.card}>
      <Text style={s.eyebrow}>01 / RENCANA NEWS</Text><Text style={s.heading}>Nonfarm Payrolls</Text>
      <Text style={s.muted}>Jadwal dan konsensus NFP diisi manual. Model awal PPI tersedia di panel terpisah; analisis event CPI dan FOMC belum aktif.</Text>
      <Text style={s.label}>Waktu rilis · WIB</Text><TextInput accessibilityLabel="Waktu rilis WIB" style={s.input} placeholder="YYYY-MM-DD HH:mm" placeholderTextColor="#7c899d" value={date} onChangeText={setDate} />
      <Text style={s.label}>Bulan data NFP yang akan dirilis</Text>
      <TextInput accessibilityLabel="Bulan target NFP" style={s.input} placeholder="YYYY-MM" placeholderTextColor="#7c899d" value={targetMonth} onChangeText={setTargetMonth} />
      <Text style={s.muted}>Contoh: rilis Desember biasanya melaporkan bulan November. Pastikan bulan target dari jadwal resmi, terutama jika rilis tertunda.</Text>
      <Text style={s.label}>Konsensus · ribu pekerjaan</Text><TextInput accessibilityLabel="Konsensus NFP" style={s.input} placeholder="Contoh format: 150" placeholderTextColor="#7c899d" value={forecast} onChangeText={setForecast} keyboardType="numbers-and-punctuation" />
      <Text style={s.label}>Sumber konsensus</Text><TextInput accessibilityLabel="Sumber konsensus" style={s.input} placeholder="Nama sumber atau URL" placeholderTextColor="#7c899d" value={source} onChangeText={setSource} />
      <Pressable disabled={!ready || savingPlan || cloudBusy} style={s.button} onPress={save}><Text style={s.buttonText}>Simpan rencana</Text></Pressable>
      <Pressable onPress={() => link('https://www.bls.gov/schedule/news_release/empsit.htm')}><Text style={s.link}>Periksa jadwal resmi BLS ↗</Text></Pressable>
      {saved && <View style={s.inset}><Text style={s.accent}>{phase(saved.release, now)}</Text><Text style={s.body}>Target NFP: {saved.targetMonth ?? 'belum diisi'}{'\n'}Persiapan: {fmt(saved.release - 5 * 3600000)}{'\n'}Entry: {fmt(saved.release - 5 * 60000)}{'\n'}Rilis: {fmt(saved.release)}</Text><Text style={s.muted}>Konsensus tersimpan: {saved.forecast} ribu · {saved.source}{'\n'}Dicatat: {fmt(saved.at)}</Text></View>}
    </View>
    <ReminderPanel plan={saved} ready={ready && !cloudBusy && !savingPlan} />
    <NfpModelPanel plan={saved} now={now} releases={research.releases} />
    <View style={s.card}>
      <Text style={s.eyebrow}>02 / RINGKASAN FUNDAMENTAL</Text>
      <Text style={s.heading}>{review.title}</Text>
      <Text style={s.muted}>{review.note}</Text>
      {review.evidence.map((item, index) => <View key={`${item.key}-${index}`} style={s.inset}>
        <Text style={s.accent}>{item.label}</Text><Text style={s.body}>{item.text}</Text>
        <Pressable onPress={() => link(item.url)}><Text style={s.link}>Periksa sumber ↗</Text></Pressable>
      </View>)}
      <Text style={s.label}>Yang perlu diperhatikan</Text>
      {review.gaps.map(gap => <Text key={gap} style={s.muted}>• {gap}</Text>)}
      <Pressable style={[s.outline, (!canRecord || savingReview || cloudBusy) && s.disabled]} disabled={!canRecord || savingReview || cloudBusy} onPress={recordReview}>
        <Text style={s.accent}>{savingReview ? 'Menyimpan…' : 'Simpan catatan persiapan'}</Text>
      </Pressable>
      <Text style={s.muted}>Simpan manual pada T−5 jam sampai T−5 menit. Estimasi NFP yang tersedia ikut diarsipkan, beserta rumus dan data yang dipakai. Pengingat tersedia di panel Android; pembaruan data di latar belakang belum aktif.</Text>
    </View>
    <View style={s.card}><Text style={s.eyebrow}>03 / DATA RESMI</Text><Text style={s.heading}>Riwayat pertumbuhan NFP</Text><Text style={s.muted}>Perubahan bulanan, ribu pekerjaan · disesuaikan musiman</Text>
      <Pressable style={s.outline} onPress={refresh} disabled={loading || !cacheReady || cloudBusy}>{loading ? <ActivityIndicator color="#e7c47c" /> : <Text style={s.accent}>Perbarui data BLS + claims</Text>}</Pressable>
      {!!cacheError && <Text accessibilityRole="alert" style={s.error}>{cacheError}</Text>}
      {!!historyError && <Text accessibilityRole="alert" style={s.error}>{historyError}</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {data?.payroll.map(row => <View key={row.period} style={s.row}><Text style={s.body}>{row.period}</Text><Text style={s.value}>{row.change > 0 ? '+' : ''}{row.change.toLocaleString('id-ID')}k</Text></View>)}
      {!data && <Text style={s.muted}>Belum ada data yang diambil. Tidak ada angka simulasi.</Text>}
      {data && <View style={s.inset}>
        <Text style={s.accent}>Data pendukung · nilai terbaru</Text>
        {support(data).map(x => <View key={x.label} style={s.support}><Text style={s.body}>{x.label}</Text><Text style={s.muted}>{x.text}</Text></View>)}
        <Text style={s.muted}>ADP/ISM dapat diisi melalui formulir laporan resmi di bawah. Claims diperbarui otomatis bersama BLS saat tombol ditekan.</Text>
      </View>}
      {updated && <Text style={s.muted}>Data diambil: {fmt(updated)}{'\n'}Versi terbaru BLS, termasuk revisi. Bukan arsip angka rilis pertama dan bukan bukti ketersediaan historis T−5 menit.</Text>}
      <Pressable onPress={() => link('https://www.bls.gov/ces/')}><Text style={s.link}>Sumber: BLS API v1 · CES, LNS, JTS, CU, WP ↗</Text></Pressable>
    </View>
    <ClaimsPanel data={data?.claims} />
    {!!manualError && <Text accessibilityRole="alert" style={s.error}>{manualError}</Text>}
    <ManualIndicatorsPanel records={manual} disabled={!manualReady || cloudBusy || savingManual} target={saved?.targetMonth} onSave={saveManual} />
    <View style={s.card}>
      <Text style={s.eyebrow}>04 / CATATAN PERSIAPAN</Text>
      <Text style={s.heading}>{history.length} catatan tersimpan</Text>
      {!history.length && <Text style={s.muted}>Catatan yang kamu simpan akan tersedia kembali setelah aplikasi dibuka.</Text>}
      {history.map(item => <View key={item.id} style={s.inset}>
        <Pressable onPress={() => setExpanded(expanded === item.id ? null : item.id)} accessibilityRole="button" accessibilityState={{ expanded: expanded === item.id }}>
          <Text style={s.accent}>NFP · {fmt(item.plan.release)}</Text>
          <Text style={s.body}>Dicatat: {fmt(item.createdAt)}</Text>
          <Text style={s.muted}>Konsensus: {item.plan.forecast} ribu · {item.review.title}</Text>
          <Text style={s.link}>{expanded === item.id ? 'Tutup detail' : 'Lihat alasan saat dicatat'}</Text>
        </Pressable>
        {expanded === item.id && <View>
          {item.nfpForecast ? <NfpForecastDetails forecast={item.nfpForecast} /> : <Text style={s.muted}>Catatan ini tidak memuat estimasi NFP.</Text>}
          <Text style={s.muted}>Data diambil: {fmt(item.cache.fetchedAt)}{'\n'}Sumber konsensus: {item.plan.source}{'\n'}Target NFP: {item.plan.targetMonth ?? 'catatan lama tanpa target'}</Text>
          {item.review.evidence.map((e, i) => <Text key={i} style={s.body}>{e.label}: {e.text}</Text>)}
          {item.review.gaps.map((gap, i) => <Text key={i} style={s.muted}>• {gap}</Text>)}
          <Text style={s.muted}>{item.review.note}</Text>
        </View>}
      </View>)}
    </View>
    {!!researchError && <Text accessibilityRole="alert" style={s.error}>{researchError}</Text>}
    <ResearchPanel research={research} history={history} disabled={!researchReady || cloudBusy || savingReview} onRelease={saveRelease} onImport={importResearch} onBusy={setResearchBusy} />
    </>}
    <CloudPanel backup={{ version: 1, plan: saved, cache, history, manual, research, ppi }} ready={ready && cacheReady && historyReady && manualReady && researchReady && ppiReady && !ppiBusy && !researchBusy && !savingManual && !loading && !savingReview && !savingPlan} canRestore={ready && cacheReady && !ppiBusy && !researchBusy && !savingManual && !loading && !savingReview && !savingPlan} onRestore={restoreBackup} onBusy={setCloudBusy} />
    <Text style={s.footer}>MODEL NFP + PPI · Estimasi eksperimental dan evaluasi terbuka.</Text>
  </ScrollView></View>;
}
const s = StyleSheet.create({
  disabled: { opacity: 0.4 },
  screen:{flex:1,backgroundColor:'#0c1421'},content:{padding:22,paddingTop:64,paddingBottom:48},eyebrow:{color:'#e7c47c',fontSize:11,fontWeight:'700',letterSpacing:2,marginBottom:12},title:{color:'#f3f5f8',fontSize:32,fontWeight:'700',lineHeight:39,marginBottom:12},muted:{color:'#9eacc0',fontSize:13,lineHeight:21},tags:{flexDirection:'row',flexWrap:'wrap',gap:8,marginVertical:24},tag:{color:'#9eacc0',padding:9,borderRadius:8,backgroundColor:'#192437',fontSize:12},active:{color:'#e7c47c',backgroundColor:'#302b23'},card:{backgroundColor:'#131f30',borderColor:'#253247',borderWidth:1,borderRadius:18,padding:20,marginBottom:18},heading:{color:'#f3f5f8',fontSize:21,fontWeight:'600',marginBottom:12},label:{color:'#c6d0df',fontSize:12,marginTop:18,marginBottom:8},input:{backgroundColor:'#0c1421',borderColor:'#344157',borderWidth:1,borderRadius:9,padding:13,color:'#fff',fontSize:15},button:{backgroundColor:'#e7c47c',padding:15,borderRadius:10,alignItems:'center',marginTop:20},buttonText:{color:'#191a20',fontWeight:'700'},link:{color:'#e7c47c',fontSize:13,marginTop:18},inset:{padding:14,backgroundColor:'#0c1421',borderRadius:10,marginVertical:15,gap:8},accent:{color:'#e7c47c',fontWeight:'600'},body:{color:'#d5deeb',fontSize:14,lineHeight:23},outline:{borderWidth:1,borderColor:'#65583f',padding:14,borderRadius:10,alignItems:'center',marginVertical:18},row:{flexDirection:'row',justifyContent:'space-between',borderBottomWidth:1,borderColor:'#253247',paddingVertical:12},support:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},value:{color:'#f3f5f8',fontSize:19,fontWeight:'600'},error:{color:'#ffaaa3',lineHeight:21,marginBottom:12},footer:{color:'#7c899d',fontSize:11,lineHeight:18,textAlign:'center'}
});
