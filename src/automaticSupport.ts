import type { NewsKind } from './automatic.ts';
import { newYorkDate } from './automaticFed.ts';

type Meta = { id: string; label: string; unit: string; frequency: 'weekly' | 'monthly' | 'daily'; events: NewsKind[]; mode: 'level' | 'index'; maxAgeDays: number };
const all: NewsKind[] = ['NFP', 'CPI', 'PPI', 'FOMC'];
export const SUPPORT_META: Meta[] = [
  { id: 'ICSA', label: 'Initial jobless claims', unit: 'orang', frequency: 'weekly', events: ['NFP', 'FOMC'], mode: 'level', maxAgeDays: 21 },
  { id: 'CCSA', label: 'Continuing claims', unit: 'orang', frequency: 'weekly', events: ['NFP', 'FOMC'], mode: 'level', maxAgeDays: 28 },
  { id: 'PCEPI', label: 'PCE headline', unit: 'indeks 2017=100', frequency: 'monthly', events: ['CPI', 'FOMC'], mode: 'index', maxAgeDays: 100 },
  { id: 'PCEPILFE', label: 'PCE core', unit: 'indeks 2017=100', frequency: 'monthly', events: ['CPI', 'FOMC'], mode: 'index', maxAgeDays: 100 },
  { id: 'JTSJOL', label: 'JOLTS lowongan kerja', unit: 'ribu pekerjaan', frequency: 'monthly', events: ['NFP', 'FOMC'], mode: 'level', maxAgeDays: 100 },
  { id: 'CIVPART', label: 'Partisipasi angkatan kerja', unit: '%', frequency: 'monthly', events: ['NFP', 'FOMC'], mode: 'level', maxAgeDays: 75 },
  { id: 'AWHAETP', label: 'Jam kerja mingguan rata-rata sektor swasta', unit: 'jam', frequency: 'monthly', events: ['NFP', 'FOMC'], mode: 'level', maxAgeDays: 75 },
  { id: 'CPIENGSL', label: 'CPI energi', unit: 'indeks 1982–84=100', frequency: 'monthly', events: ['CPI', 'PPI', 'FOMC'], mode: 'index', maxAgeDays: 75 },
  { id: 'CUSR0000SAH1', label: 'CPI shelter', unit: 'indeks 1982–84=100', frequency: 'monthly', events: ['CPI', 'FOMC'], mode: 'index', maxAgeDays: 75 },
  { id: 'CPIFABSL', label: 'CPI makanan dan minuman', unit: 'indeks 1982–84=100', frequency: 'monthly', events: ['CPI', 'FOMC'], mode: 'index', maxAgeDays: 75 },
  { id: 'DGS2', label: 'Yield Treasury nominal 2 tahun', unit: '%', frequency: 'daily', events: all, mode: 'level', maxAgeDays: 7 },
  { id: 'DGS10', label: 'Yield Treasury nominal 10 tahun', unit: '%', frequency: 'daily', events: all, mode: 'level', maxAgeDays: 7 },
  { id: 'DFII10', label: 'Yield riil Treasury 10 tahun', unit: '%', frequency: 'daily', events: all, mode: 'level', maxAgeDays: 7 },
  { id: 'DTWEXBGS', label: 'Indeks dolar broad Fed (bukan DXY)', unit: 'indeks Jan 2006=100', frequency: 'daily', events: all, mode: 'level', maxAgeDays: 10 },
  { id: 'DCOILWTICO', label: 'Minyak WTI spot', unit: 'USD/barel', frequency: 'daily', events: ['CPI', 'PPI', 'FOMC'], mode: 'level', maxAgeDays: 7 },
  { id: 'ADP', label: 'ADP pekerjaan swasta', unit: 'ribu pekerjaan', frequency: 'monthly', events: ['NFP', 'FOMC'], mode: 'level', maxAgeDays: 75 },
];
export const ADP_URL = 'https://adpemploymentreport.com/ner_production.json';
export const supportUrl = (id: string) => id === 'ADP' ? 'https://adpemploymentreport.com/' : `https://fred.stlouisfed.org/series/${id}`;
export type SupportPoint = { period: string; value: number };
export type SupportSeries = { id: string; fetchedAt: number | null; attemptedAt: number; points: SupportPoint[]; error?: string; releaseDate?: string };
export type Support = { version: 1; checkedAt: number; series: SupportSeries[] };
const DAY = 86400000, HOUR = 3600000;
const time = (t: unknown): t is number => typeof t === 'number' && Number.isSafeInteger(t) && t > 0 && t < 8640000000000000;
const date = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const month = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7));
const validValue = (meta: Meta, n: number) => Number.isFinite(n) && (meta.mode !== 'index' || n > 0)
  && (!['ICSA', 'CCSA'].includes(meta.id) || Number.isSafeInteger(n) && n >= 0)
  && (meta.id !== 'JTSJOL' || n >= 0) && (meta.id !== 'CIVPART' || n >= 0 && n <= 100)
  && (meta.id !== 'AWHAETP' || n >= 0 && n <= 168);

export function parseSupportCsv(csv: string, ids: string[], fetchedAt: number): SupportSeries[] {
  if (!time(fetchedAt) || ids.some(id => !SUPPORT_META.some(m => m.id === id && id !== 'ADP'))) throw new Error('Permintaan seri tidak valid.');
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/), header = lines[0].split(',');
  if (!['observation_date', 'DATE'].includes(header[0]) || header.length < 2 || new Set(header).size !== header.length || header.slice(1).some(id => !ids.includes(id))) throw new Error('Format CSV sumber berubah.');
  const rows = new Map(ids.map(id => [id, [] as SupportPoint[]]));
  const seen = new Set<string>(), latestAllowed = newYorkDate(fetchedAt);
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split(','), period = cells[0];
    if (cells.length !== header.length || !date(period) || seen.has(period)) throw new Error('Tanggal/kolom sumber tidak valid atau duplikat.');
    seen.add(period);
    for (let i = 1; i < cells.length; i++) {
      const raw = cells[i];
      if (raw === '' || raw === '.') continue;
      if (!/^-?\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw new Error('Nilai sumber bukan angka valid.');
      const meta = SUPPORT_META.find(m => m.id === header[i])!;
      if (!validValue(meta, Number(raw))) throw new Error('Nilai sumber di luar definisi seri.');
      if (meta.frequency === 'monthly' && !period.endsWith('-01') || meta.frequency === 'weekly' && new Date(period).getUTCDay() !== 6) throw new Error('Frekuensi seri berubah.');
      if (period <= latestAllowed) rows.get(header[i])!.push({ period, value: Number(raw) });
    }
  }
  return ids.map(id => {
    const points = rows.get(id)!.sort((a, b) => b.period.localeCompare(a.period)).slice(0, 16);
    return points.length ? { id, fetchedAt, attemptedAt: fetchedAt, points } : { id, fetchedAt: null, attemptedAt: fetchedAt, points: [], error: 'Seri tidak tersedia pada respons sumber.' };
  });
}

export function parseAdp(value: unknown, fetchedAt: number): SupportSeries {
  const d = value as { reportType: string; reportYear: string; reportMonth: string; reportPressReleaseLink: string; reportOverview: { title: string; cards: { metricName: string; metricValue: string; metricDirection: string; title: string }[] } };
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  if (!time(fetchedAt) || !d || d.reportType !== 'NER' || !/^\d{4}$/.test(d.reportYear) || !months.includes(d.reportMonth) || !Array.isArray(d.reportOverview?.cards)) throw new Error('Format laporan ADP berubah.');
  const period = `${d.reportYear}-${String(months.indexOf(d.reportMonth) + 1).padStart(2, '0')}-01`;
  const cards = d.reportOverview.cards.filter(c => c.metricName === 'Employment Change');
  const card = cards[0];
  const match = d.reportPressReleaseLink?.match(/^https:\/\/adpemploymentreport\.com\/artifacts\/us_ner\/(\d{4})(\d{2})(\d{2})\/[^/?#]+\.pdf$/);
  const releaseDate = match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  if (cards.length !== 1 || card.title !== `${d.reportMonth} ${d.reportYear}` || typeof card.metricValue !== 'string' || !/^\d{1,3}(?:,\d{3})*$|^\d+$/.test(card.metricValue)
    || !['up', 'down'].includes(card.metricDirection) || !date(period) || !date(releaseDate) || releaseDate > newYorkDate(fetchedAt) || releaseDate < period) throw new Error('Periode/nilai/tanggal ADP belum dapat dipastikan.');
  const magnitude = Number(card.metricValue.replaceAll(',', ''));
  if (!Number.isSafeInteger(magnitude)) throw new Error('Nilai ADP di luar rentang.');
  // Cross-check signed headline so an icon's meaning cannot silently invert jobs.
  const title = d.reportOverview.title;
  const expected = `Private employers ${card.metricDirection === 'up' ? 'added' : 'lost'} ${card.metricValue} jobs in ${d.reportMonth}`;
  if (title !== expected) throw new Error('Judul dan arah perubahan ADP tidak cocok atau format berubah.');
  return { id: 'ADP', fetchedAt, attemptedAt: fetchedAt, releaseDate, points: [{ period, value: magnitude * (card.metricDirection === 'down' ? -1 : 1) / 1000 }] };
}

export function readSupport(value: unknown): Support {
  const s = value as Support;
  if (!s || s.version !== 1 || !time(s.checkedAt) || !Array.isArray(s.series) || s.series.length !== SUPPORT_META.length || new Set(s.series.map(r => r?.id)).size !== s.series.length) throw new Error('Konteks pendukung tidak valid.');
  for (const r of s.series) {
    const meta = SUPPORT_META.find(m => m.id === r?.id);
    if (!meta || !time(r.attemptedAt) || r.attemptedAt > s.checkedAt || r.fetchedAt !== null && (!time(r.fetchedAt) || r.fetchedAt > r.attemptedAt)
      || !Array.isArray(r.points) || r.points.length > 16 || (r.fetchedAt === null ? r.points.length !== 0 : r.points.length === 0)
      || r.error !== undefined && (typeof r.error !== 'string' || r.error.length > 300)
      || r.releaseDate !== undefined && (r.id !== 'ADP' || !date(r.releaseDate) || r.fetchedAt === null || r.releaseDate > newYorkDate(r.fetchedAt))
      || r.id === 'ADP' && r.fetchedAt !== null && (!date(r.releaseDate) || r.points.length !== 1 || r.releaseDate < r.points[0].period)
      || !r.points.every((p, i) => p && date(p.period) && validValue(meta, p.value) && p.period <= newYorkDate(r.fetchedAt!)
        && (meta.frequency !== 'monthly' || p.period.endsWith('-01')) && (meta.frequency !== 'weekly' || new Date(p.period).getUTCDay() === 6)
        && (i === 0 || r.points[i - 1].period > p.period))) throw new Error('Seri konteks pendukung tidak valid.');
  }
  return s;
}
export function selectSupportAsOf(history: Support[], cutoff: number): Support | null {
  if (!time(cutoff)) throw new Error('Cutoff tidak valid.');
  // A historical observation date does not backdate when this version was known.
  return history.map(readSupport).filter(s => s.checkedAt <= cutoff).sort((a, b) => b.checkedAt - a.checkedAt)[0] ?? null;
}
async function download(url: string) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 3000000) throw new Error('Respons sumber terlalu besar.');
    return body;
  } finally { clearTimeout(timer); }
}
export async function fetchSupport(previous?: Support | null): Promise<Support> {
  if (previous) readSupport(previous);
  const now = Date.now();
  const batches = [SUPPORT_META.filter(m => m.frequency === 'weekly').map(m => m.id),
    SUPPORT_META.filter(m => m.frequency === 'monthly' && m.id !== 'ADP').map(m => m.id),
    SUPPORT_META.filter(m => m.frequency === 'daily').map(m => m.id), ['ADP']];
  const groups = await Promise.all(batches.map(async ids => {
    const old = ids.map(id => previous?.series.find(r => r.id === id));
    if (old.every(r => r && r.attemptedAt <= now && now - r.attemptedAt < (r.error ? HOUR : 4 * HOUR))) return old as SupportSeries[];
    try {
      const raw = await download(ids[0] === 'ADP' ? ADP_URL : `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${ids.join(',')}`);
      const at = Date.now();
      const fresh = ids[0] === 'ADP' ? [parseAdp(JSON.parse(raw), at)] : parseSupportCsv(raw, ids, at);
      return fresh.map((r, i) => r.error && old[i]?.fetchedAt && old[i]!.fetchedAt! <= now ? { ...old[i]!, attemptedAt: at, error: r.error } : r);
    } catch (e) {
      const at = Date.now(), error = (e instanceof Error ? e.message : 'Sumber gagal').slice(0, 300);
      return ids.map((id, i): SupportSeries => old[i]?.fetchedAt && old[i]!.fetchedAt! <= now ? { ...old[i]!, attemptedAt: at, error } : { id, fetchedAt: null, attemptedAt: at, points: [], error });
    }
  }));
  return readSupport({ version: 1, checkedAt: Date.now(), series: groups.flat() });
}

export function supportDetail(row: SupportSeries, now: number, event?: { kind: NewsKind; release: number }) {
  const meta = SUPPORT_META.find(m => m.id === row.id)!;
  const latest = row.points[0], previous = row.points[1];
  if (!latest || !row.fetchedAt || row.fetchedAt > now) return { status: 'missing' as const, text: 'Belum tersedia sebelum waktu analisis.' };
  const stale = now - row.fetchedAt > 6 * HOUR || Date.parse(newYorkDate(now)) - Date.parse(latest.period) > meta.maxAgeDays * DAY;
  let text = `${latest.value.toLocaleString('id-ID', { maximumFractionDigits: 4 })} ${meta.unit} · periode ${latest.period}`;
  const consecutiveMonth = previous && month(latest.period) - month(previous.period) === 1;
  if (meta.mode === 'index' && consecutiveMonth && previous.value > 0) text += ` · m/m ${((latest.value / previous.value - 1) * 100).toFixed(2)}%`;
  const yearAgo = row.points[12];
  if (meta.mode === 'index' && yearAgo && month(latest.period) - month(yearAgo.period) === 12 && yearAgo.value > 0) text += ` · y/y ${((latest.value / yearAgo.value - 1) * 100).toFixed(2)}%`;
  if (meta.frequency === 'weekly' && row.points.length >= 4 && row.points.slice(0, 4).every((p, i) => i === 0 || Date.parse(row.points[i - 1].period) - Date.parse(p.period) === 7 * DAY)) text += ` · rata-rata 4 minggu ${(row.points.slice(0, 4).reduce((n, p) => n + p.value, 0) / 4).toLocaleString('id-ID')}`;
  if (row.id === 'ADP') text += ' · pekerjaan swasta, bukan total NFP';
  if (row.id === 'ADP' && event?.kind === 'NFP' && month(newYorkDate(event.release)) - month(latest.period) !== 1) return { status: 'missing' as const, text: `${text}. Belum sesuai asumsi bulan target NFP (bulan sebelum rilis); jangan dipakai sebagai ADP bulan target.` };
  if (meta.frequency === 'daily') text += ' · data harian tertunda, bukan harga saat news';
  return { status: stale ? 'stale' as const : 'available' as const, text };
}

export function supportGaps(kind: NewsKind): string[] {
  const gaps = ['Konsensus historis, actual rilis pertama dan harga bid/ask broker belum lengkap untuk validasi arah emas.', 'Kejutan geopolitik, arus investasi, posisi pasar dan perubahan ekspektasi intraday tidak tercakup lengkap.'];
  if (kind === 'NFP' || kind === 'FOMC') gaps.push('ISM Manufacturing/Services Employment: konektor otomatis belum tersedia; akses sumber mendapat HTTP 403 saat pemeriksaan 12 November 2026.');
  if (kind !== 'NFP') gaps.push('ISM Prices, harga impor, detail komponen dan bobot inflasi belum seluruhnya diintegrasikan.');
  if (kind === 'FOMC') gaps.push('Pricing futures, PCE per komponen, ECI, GDP/permintaan, statement, proyeksi/dot plot dan komunikasi Fed belum dimodelkan bersama.');
  return gaps;
}
