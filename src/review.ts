import { ManualKind, ManualObservation, manualSummary, readManual, validManual } from './manual';
import { Fundamentals, Point, SERIES, SeriesKey } from './fundamentals';
import { ClaimsSeries, claimsUrl, fourWeekAverage, validClaimsSeries } from './claims';
import { knowledgeCutoff, monthIndex, referenceSaturday, validTargetMonth } from './periods';
import { forecastNfp, NfpForecast, validNfpForecast } from './nfpModel';
import type { FirstRelease } from './research';

export type Cache = { version: 1; fetchedAt: number; data: Fundamentals };
export type Plan = { release: number; forecast: number; source: string; at: number; targetMonth?: string };
export type Evidence = { key: SeriesKey | ManualKind | 'initialClaims' | 'continuedClaims'; label: string; text: string; url: string };
export type Review = { title: string; evidence: Evidence[]; gaps: string[]; note: string };
export type Snapshot = { id: string; createdAt: number; plan: Plan; cache: Cache; review: Review; manual?: ManualObservation[]; nfpForecast?: NfpForecast };
export const CACHE_KEY = 'aurum-fundamentals-v1';
export const HISTORY_KEY = 'aurum-reviews-v1';
const HOUR = 3600000;
const number = (value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 2 });

export function validPlan(value: unknown): value is Plan {
  if (!value || typeof value !== 'object') return false;
  const p = value as Plan;
  return Number.isFinite(p.release) && p.release > 0 && Number.isFinite(p.forecast)
    && (p.targetMonth === undefined || validTargetMonth(p.targetMonth, p.release))
    && typeof p.source === 'string' && !!p.source.trim() && Number.isFinite(p.at) && p.at > 0;
}

export function validCache(value: unknown): value is Cache {
  if (!value || typeof value !== 'object') return false;
  const c = value as Cache;
  if (c.version !== 1 || !Number.isFinite(c.fetchedAt) || c.fetchedAt <= 0 || !c.data) return false;
  if (c.data.claims !== undefined && (!c.data.claims || !validClaimsSeries(c.data.claims.initial, 'ICSA') || !validClaimsSeries(c.data.claims.continued, 'CCSA'))) return false;
  return Object.keys(SERIES).every(key => {
    const rows = c.data[key as SeriesKey];
    if (key === 'wages' && rows === undefined) return true;
    return Array.isArray(rows) && rows.length <= 6 && rows.every((row, i) => {
      if (!row || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)) return false;
      const value = 'change' in row ? row.change : row.value;
      return Number.isFinite(value) && (key === 'payroll' ? 'change' in row : 'value' in row)
        && (i === 0 || rows[i - 1].period > row.period);
    });
  });
}

export function readCache(raw: string | null): Cache | null {
  if (raw === null || raw === 'null') return null;
  const value: unknown = JSON.parse(raw);
  if (!validCache(value)) throw new Error('Data tersimpan tidak valid. Ambil ulang data BLS.');
  return value;
}

// Describes observations only; does not estimate an upcoming release or assign trade direction.
export function reviewFundamentals(cache: Cache | null, plan: Plan | null, now: number, manual: ManualObservation[] = []): Review {
  const evidence: Evidence[] = [];
  const gaps: string[] = [];
  const target = plan?.targetMonth;
  const cutoff = plan ? knowledgeCutoff(plan.release, now) : now;
  if (plan && !target) gaps.push('Rencana lama belum memiliki bulan target NFP. Isi dan simpan ulang sebelum membuat catatan baru.');
  if (!plan) gaps.push('Jadwal dan konsensus NFP belum disimpan.');
  else if (plan.release <= now) gaps.push('Waktu rilis rencana sudah lewat. Ringkasan saat ini bukan analisis sebelum rilis.');
  if (!cache) gaps.push('Data BLS belum diambil.');
  else {
    if (cache.fetchedAt > now) gaps.push('Waktu pengambilan berada di masa depan. Periksa jam perangkat dan ambil ulang data.');
    if (now - cache.fetchedAt >= 24 * HOUR) gaps.push('Data terakhir diambil lebih dari 24 jam lalu. Perbarui sebelum meninjau rencana.');
    const d = cache.data;
    const observedInTime = cache.fetchedAt <= cutoff;
    if (!observedInTime) gaps.push('Data diambil setelah batas analisis (maksimal T−5 menit), sehingga tidak dipakai dalam ringkasan sebelum rilis.');
    const describe = (key: SeriesKey, label: string, points: Point[], unit: string) => {
      if (!observedInTime) return;
      const eligible = target ? points.filter(p => p.period < target) : points;
      if (eligible.length < points.length) gaps.push(`${label}: periode ${target} atau setelahnya dikeluarkan dari konteks bulanan sebelum target NFP.`);
      const [current, previous] = eligible;
      if (!current) { gaps.push(`${label} belum tersedia dari respons BLS.`); return; }
      if (target && monthIndex(target) - monthIndex(current.period) > 1) gaps.push(`${label}: periode terbaru yang dipakai ${current.period}, tertinggal dari bulan sebelum target ${target}.`);
      let text = `${current.period}: ${number(current.value)} ${unit}.`;
      if (previous && monthIndex(current.period) - monthIndex(previous.period) === 1) {
        const delta = Math.round((current.value - previous.value) * 100) / 100;
        const comparisonUnit = key === 'unemployment' || key === 'cpi' || key === 'ppi' || key === 'wages' ? 'poin persentase' : unit;
        text += delta === 0 ? ` Tidak berubah dari ${previous.period}.`
          : ` ${delta > 0 ? 'Naik' : 'Turun'} ${number(Math.abs(delta))} ${comparisonUnit} dari ${previous.period}.`;
      } else gaps.push(`${label}: dua bulan berurutan belum tersedia untuk perbandingan.`);
      evidence.push({ key, label, text, url: `https://data.bls.gov/timeseries/${SERIES[key]}` });
    };
    describe('payroll', 'Pertambahan pekerjaan NFP', d.payroll.map(p => ({ period: p.period, value: p.change })), 'ribu pekerjaan');
    describe('unemployment', 'Tingkat pengangguran', d.unemployment, '%');
    describe('jolts', 'Lowongan JOLTS', d.jolts, 'ribu lowongan');
    describe('cpi', 'Inflasi CPI bulanan', d.cpi, '%');
    describe('ppi', 'Inflasi PPI bulanan', d.ppi, '%');
    describe('wages', 'Pertumbuhan upah per jam bulanan', d.wages ?? [], '%');
    const payrollContext = observedInTime ? d.payroll.find(p => !target || p.period < target) : undefined;
    if (plan && plan.at > cutoff) gaps.push('Konsensus dicatat setelah batas analisis dan tidak dipakai.');
    if (plan && plan.at <= cutoff && plan.release > now && payrollContext) {
      evidence.push({ key: 'payroll', label: 'Konsensus yang kamu catat',
        text: `${number(plan.forecast)} ribu pekerjaan; NFP periode ${payrollContext.period} sebesar ${number(payrollContext.change)} ribu. Selisih terhadap periode lalu bukan prediksi surprise. Sumber konsensus: ${plan.source}.`,
        url: `https://data.bls.gov/timeseries/${SERIES.payroll}` });
    }
    const describeClaims = (series: ClaimsSeries | undefined, label: string, key: 'initialClaims' | 'continuedClaims') => {
      if (!series || series.status !== 'available') {
        gaps.push(`${label} belum tersedia${series?.error ? `: ${series.error}` : '.'}`); return;
      }
      if (series.fetchedAt > cutoff) { gaps.push(`${label} diambil setelah batas analisis dan tidak dipakai.`); return; }
      if (now - series.fetchedAt >= 24 * HOUR) gaps.push(`${label} terakhir diambil lebih dari 24 jam lalu.`);
      const eligible = series.points.filter(p => (!target || p.period.slice(0, 7) <= target)
        && Date.parse(p.period + 'T00:00:00Z') <= cutoff);
      if (eligible.length < series.points.length) gaps.push(`${label}: minggu sesudah bulan target atau batas waktu dikeluarkan.`);
      const current = eligible[0];
      if (!current) { gaps.push(`${label}: tidak ada minggu yang sesuai bulan target.`); return; }
      const average = fourWeekAverage(eligible);
      let text = `Minggu berakhir ${current.period}: ${number(current.value)} klaim, disesuaikan musiman.`;
      text += average === null ? ' Rata-rata 4 minggu tidak tersedia karena data tidak berurutan.'
        : ` Rata-rata 4 minggu: ${number(average)} klaim.`;
      if (target) {
        const reference = referenceSaturday(target);
        const observed = eligible.find(p => p.period === reference);
        text += observed ? ` Minggu yang mencakup tanggal 12 (${reference}): ${number(observed.value)} klaim.`
          : ` Minggu yang mencakup tanggal 12 (${reference}) belum tersedia.`;
        text += ' Claims adalah indikator pendukung; minggu ini tidak identik dengan periode penggajian NFP.';
        if (!observed) gaps.push(`${label}: minggu acuan target ${target} belum tersedia.`);
      }
      evidence.push({ key, label, text, url: claimsUrl(series.id) });
    };
    describeClaims(d.claims?.initial, 'Initial claims', 'initialClaims');
    describeClaims(d.claims?.continued, 'Continuing claims', 'continuedClaims');
  }
  const extra = manualSummary(manual, target, cutoff);
  evidence.push(...extra.evidence); gaps.push(...extra.gaps);
  gaps.push('Model NFP awal tersedia di panel estimasi. Pemetaan dan pengujian arah XAUUSD belum tersedia.');
  return { title: evidence.length ? 'RINGKASAN DATA TERSEDIA' : !cache ? 'MENUNGGU DATA' : 'DATA BELUM LENGKAP', evidence, gaps,
    note: 'Ringkasan deskriptif, belum sinyal BUY/SELL/NETRAL. Periode indikator bisa berbeda. Angka terbaru dapat mencakup revisi; waktu pengambilan bukan waktu rilis resmi. Filter periode tidak merekonstruksi versi data historis sebelum revisi.' };
}

export function createSnapshot(cache: Cache, plan: Plan, now: number, manual: ManualObservation[] = [], releases: FirstRelease[] = []): Snapshot {
  if (!validCache(cache) || !validPlan(plan)) throw new Error('Data atau rencana belum valid.');
  readManual(JSON.stringify(manual));
  if (!plan.targetMonth) throw new Error('Isi bulan target NFP sebelum menyimpan catatan.');
  if (now < plan.release - 5 * HOUR || now > plan.release - 5 * 60000)
    throw new Error('Catatan persiapan hanya dapat disimpan antara T−5 jam dan T−5 menit.');
  if (cache.fetchedAt > now || plan.at > now) throw new Error('Waktu data atau rencana tidak valid.');
  if (now - cache.fetchedAt >= 24 * HOUR) throw new Error('Perbarui data BLS sebelum menyimpan catatan.');
  const nfpForecast = forecastNfp(plan, now, releases).forecast;
  return JSON.parse(JSON.stringify({ id: `${plan.release}-${now}`, createdAt: now, plan, cache,
    review: reviewFundamentals(cache, plan, now, manual), ...(manual.length ? { manual } : {}),
    ...(nfpForecast ? { nfpForecast } : {}) })) as Snapshot;
}

export function readHistory(raw: string | null): Snapshot[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(s => s && typeof s.id === 'string'
    && (s.manual === undefined || (Array.isArray(s.manual) && s.manual.every(validManual) && new Set(s.manual.map((m: ManualObservation) => m.id)).size === s.manual.length))
    && Number.isFinite(s.createdAt) && validPlan(s.plan) && validCache(s.cache)
    && (s.nfpForecast === undefined || (validNfpForecast(s.nfpForecast)
      && s.nfpForecast.target === s.plan.targetMonth && s.nfpForecast.consensus === s.plan.forecast
      && s.nfpForecast.estimatedAt === s.createdAt && s.createdAt >= s.plan.at
      && s.createdAt >= s.plan.release - 5 * HOUR && s.createdAt <= s.plan.release - 5 * 60000))
    && typeof s.review?.title === 'string' && typeof s.review?.note === 'string'
    && Array.isArray(s.review?.evidence) && s.review.evidence.every((e: Evidence) => e && typeof e.label === 'string' && typeof e.text === 'string')
    && Array.isArray(s.review?.gaps) && s.review.gaps.every((g: unknown) => typeof g === 'string')))
    throw new Error('Riwayat lokal tidak dapat dibaca.');
  return value as Snapshot[];
}
