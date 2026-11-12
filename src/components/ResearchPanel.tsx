import { useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseWib } from '../fundamentals';
import { Broker, FirstRelease, Research, evaluateJournal, validOutcome } from '../research';
import { evaluateResearch } from '../researchModel';
import type { Snapshot } from '../review';
import { pickJson, pickExnessCsv, shareJson } from '../files';

type Props = { research: Research; history: Snapshot[]; disabled: boolean;
  onRelease(input: Omit<FirstRelease, 'id' | 'recordedAt'>): Promise<void>; onImport(value: unknown): Promise<void>; onBusy(busy: boolean): void };
const number = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
export function ResearchPanel({ research, history, disabled, onRelease, onImport, onBusy }: Props) {
  const [period, setPeriod] = useState(''), [value, setValue] = useState(''), [date, setDate] = useState(''), [source, setSource] = useState('');
  const [broker, setBroker] = useState<Broker>('HFM');
  const [csvDate, setCsvDate] = useState(''), [csvSymbol, setCsvSymbol] = useState(''), [csvCost, setCsvCost] = useState('');
  const [showQuote, setShowQuote] = useState(false);
  const [q, setQ] = useState({ release: '', feed: '', symbol: '', entryAt: '', entryBid: '', entryAsk: '', exitAt: '', exitBid: '', exitAsk: '', cost: '', source: '' });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const working = useRef(false);
  const report = useMemo(() => evaluateResearch(research), [research]);
  const journal = useMemo(() => evaluateJournal(history, research, broker), [history, research, broker]);
  const locked = disabled || busy;
  async function run(action: () => Promise<void>) {
    if (locked || working.current) return;
    working.current = true; setBusy(true); onBusy(true); setMessage('');
    try { await action(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Operasi gagal.'); }
    finally { working.current = false; setBusy(false); onBusy(false); }
  }
  return <View style={s.card}>
    <Text style={s.title}>NFP / HASIL RILIS & EVALUASI BROKER</Text>
    <Text style={s.body}>Status sinyal XAUUSD: BELUM TERVERIFIKASI. Data harga dipakai untuk menguji hasil, bukan sebagai indikator teknikal.</Text>
    <Text style={s.label}>Tambahkan angka NFP rilis pertama</Text>
    <Text style={s.hint}>Gunakan angka pertama dari laporan BLS, bukan angka revisi. Input ini memperbarui dataset model untuk bulan berikutnya. Koreksi disimpan sebagai versi baru.</Text>
    {[
      { label: 'Bulan data NFP · YYYY-MM', v: period, set: setPeriod },
      { label: 'NFP actual · ribu pekerjaan', v: value, set: setValue },
      { label: 'Waktu rilis · YYYY-MM-DD HH:mm WIB', v: date, set: setDate },
      { label: 'URL laporan BLS · https://www.bls.gov/…', v: source, set: setSource },
    ].map(f => <TextInput key={f.label} accessibilityLabel={f.label} placeholder={f.label} placeholderTextColor="#9eacc0" style={s.input} value={f.v} onChangeText={f.set} autoCapitalize="none" />)}
    <Pressable disabled={locked} style={s.button} onPress={() => { void run(async () => {
      const publishedAt = parseWib(date), actual = Number(value.replace(',', '.'));
      if (!publishedAt || !value.trim() || !Number.isFinite(actual)) throw new Error('Periksa waktu WIB dan angka actual.');
      await onRelease({ period, value: actual, publishedAt, source: source.trim() });
      setMessage('Angka rilis tersimpan. Model berikutnya memakai versi yang tersedia sebelum cutoff.');
    }); }}><Text style={s.gold}>Simpan hasil rilis</Text></Pressable>
    <Text style={s.hint}>{research.releases.length} versi rilis manual · {research.events.length} event riset · {research.outcomes.length} hasil harga broker.</Text>
    {research.releases.slice(-3).reverse().map(r => <Text key={r.id} style={s.body}>{r.period}: {number(r.value)} ribu · input manual, belum diverifikasi otomatis.</Text>)}
    <Pressable disabled={locked} style={s.button} onPress={() => { void run(async () => {
      const file = await pickJson();
      if (file !== null) { await onImport(file); setMessage('Data valid berhasil ditambahkan. Catatan lama dipertahankan.'); }
    }); }}><Text style={s.gold}>Impor dataset / harga HFM atau Exness</Text></Pressable>
    <Pressable disabled={locked} style={s.button} onPress={() => { void run(() => shareJson(`aurum-research-${Date.now()}.json`, research)); }}><Text style={s.gold}>Ekspor dataset riset</Text></Pressable>
    <Pressable disabled={locked} style={s.button} onPress={() => { void run(() => shareJson(`aurum-evaluation-${Date.now()}.json`, report)); }}><Text style={s.gold}>Ekspor laporan evaluasi</Text></Pressable>
    <Text style={s.label}>Exness: impor langsung dari Android</Text>
    <Text style={s.hint}>Unduh tick history dari situs resmi Exness lewat browser HP, ekstrak ZIP dengan aplikasi file, lalu pilih CSV. Arsip ini indikatif dan bukan harga server MT5 akunmu; hasilnya disimpan sebagai sumber terpisah.</Text>
    <Pressable onPress={() => { void Linking.openURL('https://www.exness.com/tick-history/').catch(() => setMessage('Tautan Exness gagal dibuka.')); }}><Text style={s.gold}>Buka tick history resmi Exness ↗</Text></Pressable>
    {[
      { label: 'Waktu rilis untuk CSV · YYYY-MM-DD HH:mm WIB', v: csvDate, set: setCsvDate },
      { label: 'Simbol persis di CSV · XAUUSD / XAUUSDm / …', v: csvSymbol, set: setCsvSymbol },
      { label: 'Komisi + slippage total · USD/oz, di luar spread', v: csvCost, set: setCsvCost },
    ].map(f => <TextInput key={f.label} accessibilityLabel={f.label} placeholder={f.label} placeholderTextColor="#9eacc0" style={s.input} value={f.v} onChangeText={f.set} autoCapitalize="none" />)}
    <Pressable disabled={locked} style={s.button} onPress={() => { void run(async () => {
      const release = parseWib(csvDate), cost = Number(csvCost.replace(',', '.'));
      if (!release || !csvCost.trim() || !Number.isFinite(cost) || cost < 0 || release + 65000 > Date.now()) throw new Error('Isi waktu rilis yang sudah lewat dan biaya tambahan. Nol berarti asumsi tanpa biaya tambahan.');
      const outcome = await pickExnessCsv(release,csvSymbol.trim(),cost);
      if (outcome) { await onImport({version:1,releases:[],events:[],outcomes:[outcome]}); setMessage('Dua quote dari CSV Exness berhasil disimpan sebagai arsip indikatif.'); }
    }); }}><Text style={s.gold}>{busy ? 'Memproses…' : 'Pilih CSV Exness dari HP'}</Text></Pressable>
    <Text style={s.label}>Model multivariabel · riset</Text>
    <Text style={s.body}>Input: NFP sebelumnya, ADP, dua ISM Employment, claims, pengangguran, upah, dan konsensus. Minimum {report.minimumTraining} event pelatihan sebelum setiap prediksi uji.</Text>
    <Text style={s.body}>{report.count} prediksi di luar data pelatihan. {report.mae === null ? 'Menunggu arsip indikator lengkap dengan timestamp sebelum rilis.' : `MAE model: ${number(report.mae)} ribu; MAE konsensus: ${number(report.consensusMae!)} ribu.`}</Text>
    <View style={s.row}>{(['HFM', 'Exness'] as Broker[]).map(b => <Pressable key={b} style={s.button} onPress={() => setBroker(b)} accessibilityState={{ selected: broker === b }}><Text style={s.gold}>{broker === b ? '● ' : ''}{b}</Text></Pressable>)}</View>
    <Pressable onPress={() => setShowQuote(!showQuote)}><Text style={s.gold}>{showQuote ? 'Tutup' : 'Buka'} input bid/ask manual · {broker}</Text></Pressable>
    {showQuote && <View style={s.inset}>
      <Text style={s.hint}>Isi dari catatan quote/sumber broker yang bisa diperiksa. Harga eksekusi order saja tidak memuat kedua bid/ask. Jika data tidak tersedia, jangan mengarang nilainya. Input manual ditandai terpisah dari arsip resmi.</Text>
      {([
        ['release','Waktu rilis · YYYY-MM-DD HH:mm WIB'], ['feed','Server / jenis akun, tanpa nomor akun'], ['symbol','Simbol XAUUSD persis'],
        ['entryAt','Waktu quote entry · YYYY-MM-DD HH:mm:ss WIB'], ['entryBid','Entry bid'], ['entryAsk','Entry ask'],
        ['exitAt','Waktu quote keluar · YYYY-MM-DD HH:mm:ss WIB'], ['exitBid','Exit bid'], ['exitAsk','Exit ask'],
        ['cost','Komisi + slippage total · USD/oz'], ['source','Sumber catatan quote / laporan broker'],
      ] as const).map(([key,label]) => <TextInput key={key} accessibilityLabel={label} placeholder={label} placeholderTextColor="#9eacc0" style={s.input} value={q[key]} onChangeText={v => setQ(old => ({...old,[key]:v}))} autoCapitalize="none" />)}
      <Pressable disabled={locked} style={s.button} onPress={() => { void run(async () => {
        const time = (value: string) => {
          const base = parseWib(value.slice(0,16));
          return base && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:[0-5]\d$/.test(value) ? base + Number(value.slice(17))*1000 : NaN;
        };
        const numeric = (value: string) => value.trim() ? Number(value.replace(',', '.')) : NaN;
        const now = Date.now();
        const outcome = {id:`manual-${broker}-${now}`,release:parseWib(q.release),broker,feed:`Input manual / ${q.feed.trim()}`,symbol:q.symbol.trim(),
          entry:{at:time(q.entryAt),bid:numeric(q.entryBid),ask:numeric(q.entryAsk)},
          exit:{at:time(q.exitAt),bid:numeric(q.exitBid),ask:numeric(q.exitAsk)},cost:numeric(q.cost),source:q.source.trim(),recordedAt:now};
        if (!q.feed.trim() || !validOutcome(outcome)) throw new Error('Periksa field wajib, bid ≤ ask, dan waktu quote T−5/T+1 dengan toleransi 5 detik sesudah batas.');
        await onImport({version:1,releases:[],events:[],outcomes:[outcome]}); setMessage('Quote manual tersimpan dengan sumber terpisah.');
      }); }}><Text style={s.gold}>Simpan quote manual {broker}</Text></Pressable>
    </View>}
    {report.brokers.filter(b => b.broker === broker).map(b => <Text key={`${b.feed}-${b.symbol}`} style={s.body}>{b.feed} · {b.symbol}: {b.eligible} event cocok, {b.count} prediksi uji. {b.averageNet === null ? 'Data belum cukup.' : `Rata-rata hasil hipotetis: ${number(b.averageNet)} USD/oz. Selalu BUY: ${number(b.alwaysBuy!)}; selalu SELL: ${number(b.alwaysSell!)} USD/oz.`}</Text>)}
    <Text style={s.hint}>{report.limitation}</Text>
    <Text style={s.label}>Jurnal prediksi tersimpan · {broker}</Text>
    {!journal.length && <Text style={s.hint}>Simpan estimasi sebelum rilis untuk memulai evaluasi. Satu catatan terakhir sebelum entry dihitung untuk setiap rilis.</Text>}
    {journal.slice(0,12).map(j => <View key={j.snapshot.id} style={s.inset}>
      <Text style={s.body}>{j.snapshot.plan.targetMonth} · estimasi {number(j.snapshot.nfpForecast!.estimate)} ribu</Text>
      <Text style={s.hint}>{j.error === null ? 'Actual belum dicatat.' : `Actual ${number(j.actual!.value)} · error model ${number(j.error)} · error konsensus ${number(j.consensusError!)} ribu.`}</Text>
      {!j.outcomes.length && <Text style={s.hint}>Harga {broker} belum diimpor.</Text>}
      {j.outcomes.map(o => <Text key={o.id} style={s.hint}>{o.feed} · {o.symbol}: BUY {number(o.result.long)}, SELL {number(o.result.short)} USD/oz. Hasil hipotesis dari bid/ask T−5 hingga T+1 dan biaya tambahan {number(o.cost)} USD/oz.</Text>)}
    </View>)}
    {!!message && <Text accessibilityRole="alert" style={s.body}>{message}</Text>}
    <Pressable onPress={() => Alert.alert('Data broker', 'Android: gunakan CSV tick history Exness yang diekstrak dari ZIP, atau input bid/ask dari catatan broker yang bisa diperiksa. Arsip Exness bersifat indikatif, bukan server MT5 akun. Jika kelak tersedia PC, scripts/export-mt5.py dapat membaca tick terminal. Sumber dan broker tidak dicampur.')}><Text style={s.gold}>Tentang format impor</Text></Pressable>
  </View>;
}
const s = StyleSheet.create({
  card:{backgroundColor:'#131f30',borderColor:'#253247',borderWidth:1,borderRadius:18,padding:20,marginBottom:18,gap:12},
  title:{color:'#e7c47c',fontSize:11,fontWeight:'700'},body:{color:'#d5deeb',fontSize:14,lineHeight:23},hint:{color:'#9eacc0',fontSize:13,lineHeight:21},
  label:{color:'#f3f5f8',fontSize:16,fontWeight:'600',marginTop:10},gold:{color:'#e7c47c'},row:{flexDirection:'row',gap:12},
  input:{backgroundColor:'#0c1421',borderColor:'#344157',borderWidth:1,borderRadius:9,padding:13,color:'#fff'},
  button:{borderWidth:1,borderColor:'#65583f',padding:14,borderRadius:10},inset:{backgroundColor:'#0c1421',padding:12,borderRadius:10,gap:8},
});
