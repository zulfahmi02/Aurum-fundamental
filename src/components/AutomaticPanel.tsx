import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { AUTO_KEY, AutoReport, CALENDAR_URL, Calendar, fetchCalendar, makeAutoReport, readAutoReport, readCalendar, reportSchedule, stageNames } from '../automatic';
import { Macro, fetchMacro, needsMacroUpgrade, readMacro } from '../automaticMacro';
import { FED_CALENDAR_URL, FedContext, fetchFedContext, newYorkDate, readFedContext } from '../automaticFed';
import { AutoOutcome, readAutoOutcome } from '../automaticOutcomes';
import { biasNames } from '../automaticBias';
import { Support, fetchSupport, readSupport } from '../automaticSupport';
import { SupportPanel } from './SupportPanel';
import { AutoReminderPanel } from './AutoReminderPanel';
import { encodeAutomaticCache } from '../automaticCache';
import { PRICE_URL, PriceTick, evaluatePrices, readPriceTick, summarizePrices } from '../automaticPrices';

const fmt = (t: number) => new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
export function AutomaticPanel({ now }: { now: number }) {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [context, setContext] = useState<Macro | null>(null);
  const [fedContext, setFedContext] = useState<FedContext | null>(null);
  const [supportContext, setSupportContext] = useState<Support | null>(null);
  const [outcomes, setOutcomes] = useState<AutoOutcome[]>([]);
  const [prices, setPrices] = useState<PriceTick[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [reports, setReports] = useState<AutoReport[]>([]);
  const [status, setStatus] = useState('Mengambil kalender dan laporan…');
  const [serverStatus, setServerStatus] = useState('Memeriksa backend…');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    let active = true, busy = false, booted = false, lastRemote = 0, lastAttempt = 0, macroAttempt = 0, fedAttempt = 0;
    let macro: Macro | null = null;
    let fed: FedContext | null = null, results: AutoOutcome[] = [];
    let support: Support | null = null, ticks: PriceTick[] = [];
    let current: Calendar | null = null, history: AutoReport[] = [];
    async function sync() {
      if (busy || !active || !booted) return;
      busy = true;
      const stamp = Date.now();
      try {
        if (stamp - lastRemote >= 5 * 60000 && supabase) {
          lastRemote = stamp;
          const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
          const [cacheResult, reportResult, outcomeResult, priceResult] = await Promise.allSettled([
            supabase.from('aurum_auto_calendar').select('payload,macro,fed,support,macro_error,checked_at,error').eq('id', 'weekly').abortSignal(controller.signal).maybeSingle(),
            supabase.from('aurum_auto_reports').select('payload').order('generated_at', { ascending: false }).limit(100).abortSignal(controller.signal),
            supabase.from('aurum_auto_outcomes').select('payload').order('captured_at', { ascending: false }).limit(100).abortSignal(controller.signal),
            supabase.from('aurum_auto_prices').select('payload').order('captured_at', { ascending: false }).limit(200).abortSignal(controller.signal),
          ]).finally(() => clearTimeout(timeout));
          if (cacheResult.status === 'fulfilled' && !cacheResult.value.error && cacheResult.value.data) {
            const row = cacheResult.value.data;
            if (row.support) {
              const candidate = readSupport(row.support);
              if (candidate.checkedAt <= stamp && (!support || candidate.checkedAt > support.checkedAt)) support = candidate;
            }
            if (row.fed) {
              const candidate = readFedContext(row.fed);
              if ((!candidate.calendar || candidate.calendar.fetchedAt <= stamp) && (!candidate.rates || candidate.rates.fetchedAt <= stamp)) fed = candidate;
            }
            if (row.macro) {
              const candidate = readMacro(row.macro);
              if (candidate.fetchedAt <= stamp && (!macro || candidate.fetchedAt > macro.fetchedAt)) macro = candidate;
            }
            if (row.payload) {
              const candidate = readCalendar(row.payload);
              if (candidate.fetchedAt <= stamp && (!current || candidate.fetchedAt > current.fetchedAt)) current = candidate;
            }
            const checked = Date.parse(row.checked_at);
            if (active) setServerStatus(row.error || row.macro_error ? `Backend: ${[row.error, row.macro_error].filter(Boolean).join(' ')}` : !Number.isFinite(checked) || checked > stamp || stamp - checked > 10 * 60000
              ? 'Backend belum diperbarui lebih dari 10 menit; penjadwalan perlu diperiksa.' : 'Backend berjalan. Laporan terjadwal tetap diproses saat aplikasi ditutup.');
          } else if (active) setServerStatus('Backend otomatis belum tersedia atau tidak dapat diakses. Sementara ini pembaruan berjalan saat aplikasi terbuka.');
          if (reportResult.status === 'fulfilled' && !reportResult.value.error) {
            // One unreadable archived report must not hide the rest.
            const remote = (reportResult.value.data ?? []).flatMap(r => { try { return [readAutoReport(r.payload)]; } catch { return []; } }).filter(r => r.generatedAt <= stamp && r.origin === 'server');
            // A real server snapshot replaces the corresponding on-device preview, never vice versa.
            const map = new Map(history.map(r => [r.id, r]));
            remote.forEach(r => map.set(r.id, r));
            history = [...map.values()];
          }
          if (outcomeResult.status === 'fulfilled' && !outcomeResult.value.error) {
            results = (outcomeResult.value.data ?? []).map(r => readAutoOutcome(r.payload)).filter(r => r.capturedAt <= stamp);
            if (active) setOutcomes(results);
          }
          if (priceResult.status === 'fulfilled' && !priceResult.value.error) {
            // One malformed row must not hide the valid price records.
            ticks = (priceResult.value.data ?? []).flatMap(r => { try { return [readPriceTick(r.payload)]; } catch { return []; } }).filter(t => t.capturedAt <= stamp);
            if (active) setPrices(ticks);
          }
        }
        if ((!current || stamp - current.fetchedAt >= 3600000) && stamp - lastAttempt >= 15 * 60000) {
          lastAttempt = stamp;
          try { current = await fetchCalendar(); if (active) setError(''); }
          catch (e) { if (active) setError(e instanceof Error ? e.message : 'Kalender belum tersedia.'); }
        }
        if (!supabase && active) setServerStatus('Backend belum dikonfigurasi. Pembaruan sementara hanya saat aplikasi terbuka.');
        if (current) {
          if ((!macro || needsMacroUpgrade(macro) || stamp - macro.fetchedAt >= 4 * 3600000) && stamp - macroAttempt >= 3600000) {
            macroAttempt = stamp;
            try { macro = await fetchMacro(); if (active) setError(''); }
            catch { if (active) setError('Konteks BLS belum dapat diperbarui. Kalender tetap tersedia.'); }
          }
          if (stamp - fedAttempt >= 3600000 && (!fed?.calendar || !fed?.rates || stamp - fed.calendar.fetchedAt >= 24 * 3600000 || stamp - fed.rates.fetchedAt >= 4 * 3600000)) {
            fedAttempt = stamp;
            fed = await fetchFedContext(fed);
          }
          const generatedAt = Date.now();
          if (!support || generatedAt - support.checkedAt >= (support.series.some(r => r.error) ? 3600000 : 4 * 3600000)) support = await fetchSupport(support);
          const snapshotAt = Date.now();
          for (const event of current.events) {
            const report = makeAutoReport(event, current.fetchedAt, snapshotAt, 'device', macro, fed, support);
            if (report && !history.some(r => r.id === report.id)) history.push(report);
          }
          history = history.sort((a, b) => b.generatedAt - a.generatedAt).slice(0, 100);
          await AsyncStorage.setItem(AUTO_KEY, encodeAutomaticCache({ calendar: current, macro, fed, support, results, prices: ticks, reports: history, macroAttempt, lastAttempt, fedAttempt }));
          if (active) { setCalendar(current); setContext(macro); setFedContext(fed); setSupportContext(support); setReports([...history]); setStatus(`Kalender diperiksa ${fmt(current.fetchedAt)}`); }
        } else if (active) setStatus('Kalender belum tersedia. Aplikasi akan mencoba kembali otomatis.');
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Pembaruan gagal; data sebelumnya dipertahankan.'); }
      finally { busy = false; }
    }
    async function boot() {
      try {
        const raw = await AsyncStorage.getItem(AUTO_KEY);
        if (raw) {
          const value = JSON.parse(raw), cached = readCalendar(value.calendar);
          if (value.support) { const candidate = readSupport(value.support); if (candidate.checkedAt <= Date.now()) support = candidate; }
          if (value.fed) {
            const candidate = readFedContext(value.fed);
            if ((!candidate.calendar || candidate.calendar.fetchedAt <= Date.now()) && (!candidate.rates || candidate.rates.fetchedAt <= Date.now())) fed = candidate;
          }
          if (value.results !== undefined) {
            if (!Array.isArray(value.results) || value.results.length > 100) throw new Error('Cache hasil rilis tidak valid.');
            results = value.results.map(readAutoOutcome).filter((r: AutoOutcome) => r.capturedAt <= Date.now());
          }
          if (value.prices !== undefined) {
            if (!Array.isArray(value.prices) || value.prices.length > 200) throw new Error('Cache harga tidak valid.');
            ticks = value.prices.map(readPriceTick).filter((t: PriceTick) => t.capturedAt <= Date.now());
          }
          if (typeof value.fedAttempt === 'number' && value.fedAttempt <= Date.now()) fedAttempt = value.fedAttempt;
          if (value.macro) { const candidate = readMacro(value.macro); if (candidate.fetchedAt <= Date.now()) macro = candidate; }
          if (typeof value.macroAttempt === 'number' && value.macroAttempt <= Date.now()) macroAttempt = value.macroAttempt;
          if (typeof value.lastAttempt === 'number' && value.lastAttempt <= Date.now()) lastAttempt = value.lastAttempt;
          if (cached.fetchedAt > Date.now() || !Array.isArray(value.reports) || value.reports.length > 100) throw new Error();
          history = value.reports.map(readAutoReport).filter((r: AutoReport) => r.generatedAt <= Date.now()); current = cached;
          if (active) { setCalendar(current); setContext(macro); setFedContext(fed); setSupportContext(support); setOutcomes(results); setPrices(ticks); setReports(history); }
        }
      } catch { current = null; macro = null; fed = null; support = null; results = []; ticks = []; history = []; if (active) setError('Cache laporan tidak terbaca; mengambil kembali dari sumber.'); }
      booted = true;
      await sync();
    }
    void boot();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void sync(); }, 60000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, []);
  const eventMap = new Map(calendar?.events.map(e => [e.id, e]) ?? []);
  for (const report of reports) if (!eventMap.has(report.event.id)) eventMap.set(report.event.id, report.event);
  const events = [...eventMap.values()].filter(e => showArchive ? e.release <= now : e.release > now - 24 * 3600000).sort((a, b) => showArchive ? b.release - a.release : a.release - b.release);
  const evaluations = evaluatePrices(reports, prices), summary = summarizePrices(evaluations);
  const usd = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} USD/oz`;
  const clock = (t: number) => new Date(t).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false }) + ' WIB';
  return <View style={s.card}>
    <Text style={s.gold}>LAPORAN OTOMATIS / XAUUSD</Text>
    <Text style={s.title}>Persiapan news harian</Text>
    <Text style={s.text}>NFP · CPI · PPI · FOMC. Tidak perlu mengisi jadwal atau konsensus.</Text>
    <Text style={s.muted}>Pagi 07.00 WIB → T−5 jam → T−10 menit. Pemeriksaan terakhir dilakukan sebelum batas entry T−5 menit.</Text>
    <Text style={s.muted}>{status}{'\n'}{serverStatus}</Text>
    {!!error && <Text accessibilityRole="alert" style={s.warning}>{error}</Text>}
    {!!calendar && now - calendar.fetchedAt > 2 * 3600000 && <Text style={s.warning}>Kalender tersimpan sudah lama. Jadwal dan konsensus mungkin berubah.</Text>}
    <AutoReminderPanel events={calendar?.events ?? null} />
    <Pressable accessibilityRole="button" onPress={() => setShowArchive(v => !v)}><Text style={s.gold}>{showArchive ? 'Kembali ke agenda mendatang' : 'Lihat arsip dan hasil setelah rilis'}</Text></Pressable>
    <View style={s.inset}>
      <Text style={s.gold}>Rekap bias vs harga · T−5 menit → T+1 menit</Text>
      {summary.directional ? <>
        <Text style={s.text}>{summary.aligned} dari {summary.directional} bias BUY/SELL searah dengan pergerakan harga.</Text>
        <Text style={s.text}>Total hipotetis mengikuti bias: {usd(summary.result)} setelah spread.</Text>
        <Text style={s.muted}>Pembanding pada event yang sama — selalu BUY: {usd(summary.alwaysBuy)} · selalu SELL: {usd(summary.alwaysSell)}.</Text>
      </> : <Text style={s.text}>Belum ada event dengan bias BUY/SELL dan harga lengkap. {summary.events ? `${summary.events} event sudah punya harga tetapi biasnya netral atau tanpa sinyal.` : 'Harga dicatat otomatis mulai rilis berikutnya.'}</Text>}
      <Text style={s.muted}>Harga indikatif Swissquote, bukan server HFM/Exness dan bukan harga eksekusi. Per troy ounce, tanpa komisi/slippage. Jumlah event masih sedikit; ini catatan, bukan ukuran akurasi.</Text>
      <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(PRICE_URL).catch(() => {}); }}><Text style={s.gold}>Sumber harga ↗</Text></Pressable>
    </View>
    {!events.length && <Text style={s.text}>{showArchive ? 'Belum ada event lampau dalam arsip perangkat/server.' : calendar ? 'Tidak ada event target mendatang pada kalender yang tersedia. Feed ini hanya mencakup minggu berjalan; ini bukan kepastian tidak ada news minggu berikutnya.' : 'Menunggu data kalender. Tidak ada jadwal contoh atau sinyal buatan.'}</Text>}
    {events.map(event => {
      const records = reports.filter(r => r.event.id === event.id).sort((a, b) => a.generatedAt - b.generatedAt);
      const cutoff = now > event.release - 5 * 60000;
      const latest = records.at(-1);
      const outdated = !!latest && (now - latest.calendarFetchedAt > 2 * 3600000 || !latest.macroFetchedAt || now - latest.macroFetchedAt > 6 * 3600000);
      const outcome = outcomes.find(o => o.eventId === event.id);
      const priced = evaluations.find(e => e.eventId === event.id);
      const legs = prices.filter(t => t.eventId === event.id);
      const fedDateMatched = event.kind === 'FOMC' && fedContext?.calendar?.meetings.some(m => m.date === newYorkDate(event.release));
      return <View key={event.id} style={s.inset}>
        <Text style={s.title}>{event.kind}</Text><Text style={s.text}>{fmt(event.release)}</Text>
        <Text style={s.gold}>{cutoff ? 'ARSIP PERSIAPAN · batas entry sudah lewat' : outdated ? 'BIAS TERSIMPAN · menunggu pembaruan terjadwal' : latest ? biasNames[latest.bias] : 'MENUNGGU JADWAL LAPORAN'}</Text>
        {latest && <Text style={s.muted}>Snapshot terakhir: {biasNames[latest.bias]} · {fmt(latest.generatedAt)}{outdated && !cutoff ? '. Data snapshot sudah lama; jangan dibaca sebagai analisis terkini.' : ''}</Text>}
        <Text style={s.muted}>{fedDateMatched ? 'Tanggal rapat cocok dengan kalender resmi Fed. Jam keputusan dan konsensus masih dari Forex Factory/Fair Economy.' : 'Jadwal menurut Forex Factory/Fair Economy, belum cocok dengan sumber resmi.'}</Text>
        {event.items.map(item => <Text key={item.title} style={s.text}>{item.title}: konsensus {item.forecast || 'belum tersedia'} · previous {item.previous || 'belum tersedia'}</Text>)}
        <Text style={s.muted}>Previous dapat mencakup revisi. Angka actual tidak tersedia pada feed ini.</Text>
        {!records.length && <Text style={s.muted}>Laporan pertama dijadwalkan {fmt(reportSchedule(event.release)[0].at)}. Jika waktu itu terlewat, aplikasi tidak mengaku telah menyiapkannya sejak pagi.</Text>}
        {records.map(report => <View key={report.id} style={s.field}>
          <Pressable accessibilityRole="button" onPress={() => setExpanded(expanded === report.id ? null : report.id)}>
            <Text style={s.gold}>{stageNames[report.stage]} · {report.origin === 'server' ? 'backend' : 'dibuat saat aplikasi terbuka'} ▾</Text>
            <Text style={s.text}>{biasNames[report.bias]}</Text>
            <Text style={s.muted}>Dibuat {fmt(report.generatedAt)}{report.generatedAt - report.scheduledAt > 5 * 60000 ? ' · terlambat dari jadwal' : ''}</Text>
            {report.macroFetchedAt && <Text style={s.muted}>Konteks BLS diambil {fmt(report.macroFetchedAt)}</Text>}
          </Pressable>
          {report.analysis && <Text style={s.muted}>{report.analysis.method === 'persistence-vs-consensus' ? 'Asumsi: angka terakhir berlanjut, dibanding konsensus.' : 'Konteks kebijakan; bukan prediksi keputusan FOMC.'} Belum teruji untuk arah harga T−5 sampai T+1.</Text>}
          {expanded === report.id && <>
            <SupportPanel support={report.support} now={report.generatedAt} kind={report.event.kind} release={report.event.release} />
            {report.analysis?.reasons.map((r, i) => <Text key={`a${i}`} style={s.text}>{r}</Text>)}
            {report.analysis?.blockers.map((r, i) => <Text key={`b${i}`} style={s.warning}>{r}</Text>)}
            {!report.analysis && <Text style={s.muted}>Arsip versi lama sebelum bias eksperimen diaktifkan. Isi arsip tidak dihitung ulang.</Text>}
            {report.reasons.map((r, i) => <Text key={`r${i}`} style={s.text}>{r}</Text>)}
            {report.missing.map((r, i) => <Text key={`m${i}`} style={s.warning}>{r}</Text>)}
          </>}
        </View>)}
        <Text style={s.muted}>BUY/SELL adalah bias eksperimen, bukan kepastian harga. NETRAL berarti belum ada arah dominan; belum ada sinyal berarti persyaratan data tidak terpenuhi.</Text>
        {outcome && <View style={s.field}>
          <Text style={s.gold}>{outcome.quality === 'official-statement' ? 'Hasil pernyataan resmi Fed' : 'Observasi BLS setelah rilis · belum terverifikasi sebagai actual awal'}</Text>
          <Text style={s.text}>{outcome.lower !== undefined ? `${outcome.lower}–${outcome.value}` : outcome.value} {outcome.unit} · {outcome.period}</Text>
          {outcome.consensus !== null && <Text style={s.text}>Konsensus tersimpan: {outcome.consensus} {outcome.unit}. Selisih terhadap observasi: {outcome.difference!.toLocaleString('id-ID', { maximumFractionDigits: 3 })} {outcome.unit === '%' ? 'poin persentase' : 'ribu pekerjaan'}.</Text>}
          <Text style={s.muted}>Diambil {fmt(outcome.capturedAt)}. {outcome.note}</Text>
          <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(outcome.source).catch(() => {}); }}><Text style={s.gold}>Sumber hasil ↗</Text></Pressable>
        </View>}
        {priced && <View style={s.field}>
          <Text style={s.gold}>Harga XAUUSD · T−5 menit → T+1 menit</Text>
          <Text style={s.text}>Entry {clock(priced.entry.at)}: bid {priced.entry.bid} / ask {priced.entry.ask}{'\n'}Exit {clock(priced.exit.at)}: bid {priced.exit.bid} / ask {priced.exit.ask}</Text>
          <Text style={s.text}>Harga tengah {priced.midChange > 0 ? 'naik' : priced.midChange < 0 ? 'turun' : 'tidak berubah'} {usd(priced.midChange)}.</Text>
          {priced.result !== null ? <Text style={s.text}>Bias {priced.bias} {priced.aligned ? 'searah' : 'tidak searah'} dengan harga. Hasil hipotetis setelah spread: {usd(priced.result)}.</Text>
            : <Text style={s.muted}>{priced.bias ? 'Bias terakhir sebelum entry bukan BUY/SELL, jadi tidak ada arah yang dinilai.' : 'Tidak ada laporan backend sebelum entry untuk dinilai.'} BUY hipotetis {usd(priced.buy)} · SELL hipotetis {usd(priced.sell)}.</Text>}
        </View>}
        {!priced && now > event.release + 2 * 60000 && <Text style={s.muted}>{legs.length ? 'Hanya satu dari dua harga (T−5 menit / T+1 menit) yang tercatat; arah tidak dinilai.' : 'Harga T−5 menit dan T+1 menit tidak tercatat untuk event ini.'} Harga langsung tidak bisa diambil ulang belakangan dan tidak diisi dengan perkiraan.</Text>}
        {event.release <= now && !outcome && <Text style={s.muted}>{!records.some(r => r.origin === 'server') ? 'Belum ada catatan backend sebelum rilis untuk dipasangkan dengan hasil.'
          : now > event.release + 72 * 3600000 ? 'Jendela pengambilan hasil 72 jam sudah lewat tanpa pasangan yang valid. Tidak ada hasil atau skor yang direkayasa.'
            : 'Belum ada hasil yang berhasil dipasangkan. Sumber yang gagal, periode yang ambigu, atau jam berbeda tidak diisi dengan tebakan.'}</Text>}
      </View>;
    })}
    <SupportPanel support={supportContext} now={now} />
    {fedContext && <View style={s.inset}>
      <Text style={s.gold}>Konteks resmi FOMC</Text>
      {fedContext.rates ? <Text style={s.text}>Rentang target Fed: {fedContext.rates.lower}–{fedContext.rates.upper}% · berlaku {fedContext.rates.period}.
        {'\n'}Diambil {fmt(fedContext.rates.fetchedAt)}. Ini posisi kebijakan saat ini, bukan prediksi keputusan berikutnya.</Text> : <Text style={s.warning}>Rentang suku bunga belum tersedia.</Text>}
      {fedContext.calendar?.meetings.filter(m => m.date >= newYorkDate(now)).slice(0, 3).map(m => <Text key={m.date} style={s.text}>Akhir rapat: {m.date} (tanggal AS){m.projections ? ' · dengan proyeksi ekonomi' : ''}</Text>)}
      {fedContext.calendar && <Text style={s.muted}>Kalender Fed diperiksa {fmt(fedContext.calendar.fetchedAt)}.</Text>}
      {fedContext.calendar && now - fedContext.calendar.fetchedAt > 48 * 3600000 && <Text style={s.warning}>Kalender Fed sudah lebih dari dua hari; jadwal perlu diperiksa kembali.</Text>}
      {fedContext.rates && now - fedContext.rates.fetchedAt > 6 * 3600000 && <Text style={s.warning}>Data rentang suku bunga belum diperbarui lebih dari enam jam.</Text>}
      <Text style={s.muted}>Kalender rapat memberi tanggal. Jam analisis otomatis menunggu jadwal keputusan pada feed; tidak diasumsikan dari tanggal rapat saja.</Text>
      {fedContext.errors.map(e => <Text key={e} style={s.warning}>{e}</Text>)}
      <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(FED_CALENDAR_URL).catch(() => {}); }}><Text style={s.gold}>Kalender resmi Fed ↗</Text></Pressable>
    </View>}
    {context && <View style={s.inset}>
      <Text style={s.gold}>Konteks terbaru dari BLS</Text>
      <Text style={s.muted}>Diambil {fmt(context.fetchedAt)} · versi terbaru termasuk revisi. Ini konteks saat ini, bukan salinan laporan pagi.</Text>
      {now - context.fetchedAt > 6 * 3600000 && <Text style={s.warning}>Konteks belum diperbarui lebih dari enam jam.</Text>}
      {context.observations.map(o => <Text key={o.id} style={s.text}>{o.label}: {o.value.toLocaleString('id-ID')} {o.unit} · {o.period}</Text>)}
      {context.missing.map(m => <Text key={m} style={s.warning}>{m}</Text>)}
      <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.bls.gov/developers/').catch(() => {}); }}><Text style={s.gold}>Sumber data BLS ↗</Text></Pressable>
    </View>}
    <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(CALENDAR_URL).catch(() => {}); }}><Text style={s.gold}>Sumber jadwal dan konsensus ↗</Text></Pressable>
  </View>;
}
const s = StyleSheet.create({
  card: { padding: 20, backgroundColor: '#131f30', borderRadius: 18, marginBottom: 18, gap: 14 },
  inset: { padding: 14, backgroundColor: '#0c1421', borderRadius: 10, gap: 10 }, field: { gap: 8, marginTop: 8 },
  title: { color: '#f3f5f8', fontSize: 21, fontWeight: '600' }, gold: { color: '#e7c47c', fontWeight: '600' },
  text: { color: '#d5deeb', lineHeight: 23 }, muted: { color: '#9eacc0', fontSize: 13, lineHeight: 21 }, warning: { color: '#ffcf9c', fontSize: 13, lineHeight: 21 },
});
