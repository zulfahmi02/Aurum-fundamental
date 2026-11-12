import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseWib } from '../fundamentals';
import { PPI_DATASET } from '../data/ppiFirst';
import { PPI_EVALUATION, PpiForecast, PpiState, appendPpiRelease, forecastPpi, ppiNumber, recordPpi, savePpiPlan } from '../ppiModel';

const num = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 3 });
const dateInput = (t: number) => new Date(t + 7 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
const fmt = (t: number) => `${dateInput(t)} WIB`;
const link = (url: string) => { void Linking.openURL(url).catch(() => Alert.alert('Tautan gagal dibuka', url)); };
function Field({ label, value, onChange, placeholder, numeric = false, disabled }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; numeric?: boolean; disabled: boolean;
}) {
  return <View style={s.field}><Text style={s.body}>{label}</Text><TextInput accessibilityLabel={label} style={s.input}
    value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#7c899d" editable={!disabled}
    keyboardType={numeric ? 'numbers-and-punctuation' : 'default'} autoCapitalize="none" autoCorrect={false} /></View>;
}
function Button({ children, onPress, disabled = false }: { children: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.accent}>{children}</Text></Pressable>;
}
function Details({ forecast: f }: { forecast: PpiForecast }) {
  const comparison = f.difference > 0 ? 'di atas' : f.difference < 0 ? 'di bawah' : 'sama dengan';
  return <View style={s.inset}>
    <Text style={s.value}>{num(f.estimate)}% m/m</Text>
    <Text style={s.body}>Estimasi PPI {f.target} · {comparison} konsensus {num(f.consensus)}%.
      {'\n'}Selisih: {num(f.difference)} poin persentase, bukan surprise aktual.</Text>
    <Text style={s.muted}>Input: tiga angka headline rilis pertama, disesuaikan musiman.</Text>
    {f.inputs.map(r => <Pressable key={r.period} accessibilityRole="link" onPress={() => link(r.source)}>
      <Text style={s.accent}>{r.period}: {num(r.value)}% ↗</Text><Text style={s.muted}>Diterbitkan {fmt(r.publishedAt)}</Text>
    </Pressable>)}
    <Text style={s.body}>Rumus: {num(f.fit.intercept)} + ({num(f.fit.slope)} × rata-rata tiga bulan).
      {'\n'}Dilatih dari {f.fit.count} pasangan, {f.fit.from}–{f.fit.through}. Koefisien tampilan dibulatkan.</Text>
    <Text style={s.muted}>Model {f.model} · {f.dataset}.
      {'\n'}Energi, komponen barang/jasa, ISM Prices, dan core PPI belum masuk rumus. Estimasi ini belum memprediksi arah XAUUSD.</Text>
  </View>;
}
export function PpiPanel({ state, now, ready, disabled, onChange }: {
  state: PpiState; now: number; ready: boolean; disabled: boolean;
  onChange: (change: (current: PpiState) => PpiState) => Promise<void>;
}) {
  const [date, setDate] = useState(() => state.plan ? dateInput(state.plan.release) : '');
  const [target, setTarget] = useState(state.plan?.target ?? '');
  const [consensus, setConsensus] = useState(() => state.plan ? String(state.plan.consensus) : '');
  const [source, setSource] = useState(state.plan?.source ?? '');
  const [actualMonth, setActualMonth] = useState(''), [actual, setActual] = useState('');
  const [published, setPublished] = useState(''), [actualSource, setActualSource] = useState('');
  const [showActual, setShowActual] = useState(false), [showHistory, setShowHistory] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const locked = !ready || disabled || busy;
  const result = ready ? forecastPpi(state.plan, now, state.releases) : { forecast: null, reason: 'Menunggu penyimpanan PPI siap.' };
  const plan = state.plan;
  const canRecord = !!plan && !!result.forecast && now >= plan.release - 5 * 3600000 && now <= plan.release - 5 * 60000;
  async function run(change: (current: PpiState) => PpiState, success: string) {
    if (locked) return;
    setBusy(true); setMessage('');
    try { await onChange(change); setMessage(success); }
    catch (e) { Alert.alert('PPI belum tersimpan', e instanceof Error ? e.message : 'Penyimpanan gagal.'); }
    finally { setBusy(false); }
  }
  function savePlan() {
    void run(current => {
      const at = Date.now();
      return savePpiPlan(current, { target: target.trim(), release: parseWib(date) ?? 0, consensus: ppiNumber(consensus), source: source.trim(), at }, at);
    }, 'Rencana PPI tersimpan di perangkat.');
  }
  function saveActual() {
    void run(current => appendPpiRelease(current, { period: actualMonth.trim(), value: ppiNumber(actual),
      publishedAt: parseWib(published) ?? 0, source: actualSource.trim() }, Date.now()), 'Versi rilis pertama ditambahkan. Catatan lama tetap sama.');
  }
  const evaluation = PPI_EVALUATION;
  return <View style={s.card}>
    <Text style={s.eyebrow}>PPI / MODEL AWAL</Text>
    <Text style={s.heading}>Producer Price Index</Text>
    <Text style={s.body}>Final demand headline · perubahan bulanan m/m · disesuaikan musiman.</Text>
    <Text style={s.muted}>Isi jadwal dan konsensus untuk ukuran ini. Jangan masukkan angka y/y atau core. Konsensus masih dicatat manual.</Text>
    <Field label="Waktu rilis PPI · WIB" value={date} onChange={setDate} placeholder="YYYY-MM-DD HH:mm" disabled={locked} />
    <Field label="Bulan target PPI" value={target} onChange={setTarget} placeholder="YYYY-MM" disabled={locked} />
    <Field label="Konsensus PPI headline · % m/m" value={consensus} onChange={setConsensus} placeholder="0,2 berarti 0,2%" numeric disabled={locked} />
    <Field label="Sumber konsensus PPI" value={source} onChange={setSource} placeholder="Nama sumber atau URL" disabled={locked} />
    <Button onPress={savePlan} disabled={locked}>Simpan rencana PPI</Button>
    <Pressable accessibilityRole="link" onPress={() => link('https://www.bls.gov/schedule/news_release/ppi.htm')}><Text style={s.accent}>Periksa jadwal resmi PPI ↗</Text></Pressable>
    {plan && <Text style={s.body}>Rencana tersimpan: {plan.target} · {num(plan.consensus)}% · {plan.source}
      {'\n'}Persiapan T−5 jam: {fmt(plan.release - 5 * 3600000)}
      {'\n'}Batas pencatatan T−5 menit: {fmt(plan.release - 5 * 60000)}
      {'\n'}Rilis: {fmt(plan.release)}
      {'\n'}Keluar T+1 menit: {fmt(plan.release + 60000)}</Text>}
    {result.forecast ? <Details forecast={result.forecast} /> : <Text style={s.body}>{result.reason}</Text>}
    <Button disabled={locked || !canRecord} onPress={() => { void run(current => recordPpi(current, Date.now()), 'Catatan PPI tersimpan sebagai salinan tetap.'); }}>Simpan catatan persiapan PPI</Button>
    <Text style={s.muted}>Buka aplikasi untuk memeriksa estimasi dan simpan catatan pada T−5 jam sampai T−5 menit. Jadwal pengingat dan pengambilan otomatis PPI belum tersedia.</Text>
    {!!message && <Text accessibilityLiveRegion="polite" style={s.accent}>{message}</Text>}
    <View style={s.inset}>
      <Text style={s.heading}>Evaluasi historis PPI</Text>
      <Text style={s.body}>{evaluation.from}–{evaluation.through}: {evaluation.count} prediksi; {evaluation.missingOrSkipped} bulan dilewati karena data tidak lengkap.</Text>
      {evaluation.model && evaluation.baseline && <>
        <Text style={s.body}>Rata-rata kesalahan absolut (MAE):
          {'\n'}Model: {num(evaluation.model.mae)} poin persentase.
          {'\n'}Rata-rata 3 bulan: {num(evaluation.baseline.mae)} poin persentase.</Text>
        <Text style={s.muted}>{evaluation.model.mae < evaluation.baseline.mae
          ? 'Kesalahan model lebih kecil pada sampel ini; perlu evaluasi rilis mendatang.'
          : 'Model belum mengalahkan rata-rata sederhana pada sampel ini.'}</Text>
      </>}
      <Text style={s.muted}>Pelatihan berurutan, dengan cutoff publikasi T−5 menit tiap rilis. Arsip dikumpulkan belakangan; ini simulasi retrospektif. MAE bukan peluang benar. Belum diuji terhadap konsensus historis atau harga XAUUSD T−5 sampai T+1.</Text>
    </View>
    <Text style={s.muted}>Dataset bawaan: {PPI_DATASET.rows.length} rilis, Januari 2024–September 2026. Oktober 2025 tidak memiliki rilis bulanan terbit, sehingga tidak diisi dengan revisi. Tambahan/koreksi manual: {state.releases.length} versi. Evaluasi tetap menggunakan dataset bawaan.</Text>
    <Pressable accessibilityRole="link" onPress={() => link(PPI_DATASET.sourceUrl)}><Text style={s.accent}>Arsip rilis resmi PPI BLS ↗</Text></Pressable>
    <Button onPress={() => setShowActual(v => !v)}>{showActual ? 'Tutup formulir hasil rilis PPI' : 'Tambah / koreksi angka rilis pertama PPI'}</Button>
    {showActual && <View style={s.inset}>
      <Text style={s.body}>Salin headline m/m bulan target dari paragraf pembuka arsip rilis asli. Jangan pakai angka revisi bulan sebelumnya atau indeks level.</Text>
      <Field label="Bulan hasil PPI" value={actualMonth} onChange={setActualMonth} placeholder="YYYY-MM" disabled={locked} />
      <Field label="Actual PPI headline · % m/m" value={actual} onChange={setActual} placeholder="Contoh: -0,1" numeric disabled={locked} />
      <Field label="Waktu publikasi hasil PPI · WIB" value={published} onChange={setPublished} placeholder="YYYY-MM-DD HH:mm" disabled={locked} />
      <Field label="URL arsip rilis PPI BLS" value={actualSource} onChange={setActualSource} placeholder="https://www.bls.gov/news.release/archives/ppi_MMDDYYYY.htm" disabled={locked} />
      <Button disabled={locked} onPress={saveActual}>Simpan versi hasil PPI</Button>
      {state.releases.slice(-5).reverse().map(r => <Text key={`${r.period}-${r.recordedAt}`} style={s.muted}>{r.period}: {num(r.value)}% · dicatat {fmt(r.recordedAt)}</Text>)}
    </View>}
    <Button onPress={() => setShowHistory(v => !v)}>{`${showHistory ? 'Tutup' : 'Lihat'} catatan PPI (${state.history.length})`}</Button>
    {showHistory && <View style={s.field}>
      {!state.history.length && <Text style={s.muted}>Belum ada catatan persiapan PPI.</Text>}
      {state.history.map(snap => <View key={snap.id} style={s.inset}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === snap.id }} onPress={() => setExpanded(expanded === snap.id ? null : snap.id)}>
          <Text style={s.accent}>PPI {snap.plan.target} · estimasi {num(snap.forecast.estimate)}%</Text>
          <Text style={s.muted}>Dicatat {fmt(snap.forecast.estimatedAt)} · ketuk untuk detail</Text>
        </Pressable>
        {expanded === snap.id && <><Text style={s.body}>Rilis {fmt(snap.plan.release)} · konsensus dari {snap.plan.source}</Text><Details forecast={snap.forecast} /></>}
      </View>)}
    </View>}
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: '#131f30', borderColor: '#253247', borderWidth: 1, borderRadius: 18, padding: 20, marginBottom: 18, gap: 14 },
  inset: { padding: 14, backgroundColor: '#0c1421', borderRadius: 10, gap: 12 },
  field: { gap: 8 }, disabled: { opacity: 0.4 },
  input: { backgroundColor: '#0c1421', borderColor: '#344157', borderWidth: 1, borderRadius: 9, padding: 13, color: '#fff', fontSize: 15 },
  button: { borderColor: '#65583f', borderWidth: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  eyebrow: { color: '#e7c47c', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  heading: { color: '#f3f5f8', fontSize: 21, fontWeight: '600' },
  value: { color: '#e7c47c', fontSize: 24, fontWeight: '700' },
  accent: { color: '#e7c47c', fontWeight: '600' },
  body: { color: '#d5deeb', fontSize: 14, lineHeight: 23 },
  muted: { color: '#9eacc0', fontSize: 13, lineHeight: 21 },
});
