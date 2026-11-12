import { PPI_DATASET } from './data/ppiFirst';
import { knowledgeCutoff, monthIndex, validMonth, validTargetMonth } from './periods';

export const PPI_KEY = 'aurum-ppi-v1';
export type PpiRow = { period: string; value: number; publishedAt: number; source: string };
export type PpiRelease = PpiRow & { recordedAt: number };
export type PpiPlan = { target: string; release: number; consensus: number; source: string; at: number };
type Fit = { intercept: number; slope: number; count: number; from: string; through: string };
export type PpiForecast = {
  model: 'ppi-ols-mean3-v1'; dataset: string; datasetKnownAt: number; estimatedAt: number; target: string;
  estimate: number; consensus: number; difference: number; inputs: PpiRow[]; fit: Fit;
};
export type PpiSnapshot = { id: string; plan: PpiPlan; forecast: PpiForecast };
export type PpiState = {
  version: 1; unit: 'percent-mom-sa'; metric: 'final-demand-headline';
  plan: PpiPlan | null; releases: PpiRelease[]; history: PpiSnapshot[];
};
export const emptyPpi = (): PpiState => ({ version: 1, unit: 'percent-mom-sa', metric: 'final-demand-headline', plan: null, releases: [], history: [] });
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const time = (v: number) => Number.isFinite(v) && v > 0 && v <= 8640000000000000;
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 2000;
const rate = (v: number) => Number.isFinite(v) && v >= -100 && v <= 100;
export function ppiNumber(input: string): number {
  const value = input.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) || !rate(Number(value)))
    throw new Error('Isi angka persen m/m, misalnya 0,2 untuk 0,2%.');
  return Number(value);
}
function official(source: string): boolean {
  try { const u = new URL(source); return u.protocol === 'https:' && u.hostname === 'www.bls.gov'
    && /^\/news\.release\/archives\/ppi_\d{8}\.htm$/.test(u.pathname) && !u.search && !u.hash && !u.username && !u.password; }
  catch { return false; }
}
function validRow(r: PpiRow): boolean {
  return !!r && validTargetMonth(r.period, r.publishedAt) && rate(r.value) && text(r.source) && official(r.source);
}
export function validPpiPlan(p: PpiPlan): boolean {
  return !!p && validTargetMonth(p.target, p.release) && rate(p.consensus) && text(p.source)
    && time(p.at) && p.at <= p.release - 5 * 60000;
}
function checked(rows: readonly PpiRow[]): PpiRow[] {
  if (rows.some(r => !validRow(r)) || new Set(rows.map(r => r.period)).size !== rows.length)
    throw new Error('Dataset PPI tidak valid atau memiliki bulan ganda.');
  return [...rows].sort((a, b) => a.period.localeCompare(b.period));
}
function lags(rows: readonly PpiRow[], target: string, cutoff: number): PpiRow[] | null {
  const values = rows.filter(r => r.period < target && r.publishedAt <= cutoff).slice(-3);
  return values.length === 3 && values.every((r, i) => monthIndex(target) - monthIndex(r.period) === 3 - i)
    ? values.map(r => ({ ...r })) : null;
}

// Each historical training pair uses only inputs published by its own T−5 cutoff.
// Archived first-release values were collected retrospectively, not captured live.
export function fitPpi(rows: readonly PpiRow[], target: string, cutoff: number) {
  if (!validMonth(target) || !time(cutoff)) throw new Error('Target atau cutoff PPI tidak valid.');
  const past = checked(rows).filter(r => r.period < target && r.publishedAt <= cutoff);
  const inputs = lags(past, target, cutoff);
  if (!inputs) return null;
  const training = past.flatMap(row => {
    const previous = lags(past, row.period, row.publishedAt - 5 * 60000);
    return previous ? [{ period: row.period, x: mean(previous.map(r => r.value)), y: row.value }] : [];
  });
  if (training.length < 12) return null;
  const xm = mean(training.map(r => r.x)), ym = mean(training.map(r => r.y));
  const variance = training.reduce((sum, r) => sum + (r.x - xm) ** 2, 0);
  const slope = variance === 0 ? 0 : training.reduce((sum, r) => sum + (r.x - xm) * (r.y - ym), 0) / variance;
  const intercept = ym - slope * xm;
  const baseline = mean(inputs.map(r => r.value));
  const estimate = intercept + slope * baseline;
  if (![estimate, slope, intercept].every(Number.isFinite)) return null;
  const fit: Fit = { intercept, slope, count: training.length, from: training[0].period, through: training.at(-1)!.period };
  return { estimate, baseline, inputs, fit };
}
export function evaluatePpi(rows: readonly PpiRow[], from: string, through: string) {
  if (!validMonth(from) || !validMonth(through) || from > through) throw new Error('Periode evaluasi PPI tidak valid.');
  const data = checked(rows);
  const predictions = data.filter(r => r.period >= from && r.period <= through).flatMap(row => {
    const result = fitPpi(data, row.period, row.publishedAt - 5 * 60000);
    return result ? [{ target: row.period, release: row.publishedAt, actual: row.value, estimate: result.estimate,
      baseline: result.baseline, trainingThrough: result.fit.through, trainingCount: result.fit.count }] : [];
  });
  const metrics = (key: 'estimate' | 'baseline') => predictions.length ? {
    mae: mean(predictions.map(p => Math.abs(p[key] - p.actual))),
    rmse: Math.sqrt(mean(predictions.map(p => (p[key] - p.actual) ** 2))),
    bias: mean(predictions.map(p => p[key] - p.actual)),
  } : null;
  return { from, through, count: predictions.length,
    missingOrSkipped: monthIndex(through) - monthIndex(from) + 1 - predictions.length,
    model: metrics('estimate'), baseline: metrics('baseline'), predictions };
}
export const PPI_EVALUATION = evaluatePpi(PPI_DATASET.rows, '2025-04', '2026-09');

export function forecastPpi(plan: PpiPlan | null, now: number, releases: readonly PpiRelease[] = []):
  { forecast: PpiForecast; reason?: never } | { forecast: null; reason: string } {
  if (!plan || !validPpiPlan(plan) || !time(now)) return { forecast: null, reason: 'Simpan rencana PPI headline m/m dan konsensus terlebih dahulu.' };
  const cutoff = knowledgeCutoff(plan.release, now);
  if (now > plan.release - 5 * 60000) return { forecast: null, reason: 'Batas T−5 menit sudah lewat. Periksa catatan PPI yang telah disimpan.' };
  if (plan.at > cutoff || PPI_DATASET.capturedAt > cutoff) return { forecast: null, reason: 'Rencana atau dataset belum tersedia pada waktu ini.' };
  const map = new Map<string, PpiRow>(PPI_DATASET.rows.filter(r => r.publishedAt <= cutoff).map(r => [r.period, r]));
  const eligible = releases.filter(r => validRow(r) && time(r.recordedAt) && r.publishedAt <= r.recordedAt && r.recordedAt <= cutoff)
    .sort((a, b) => a.recordedAt - b.recordedAt);
  eligible.forEach(r => map.set(r.period, { period: r.period, value: r.value, publishedAt: r.publishedAt, source: r.source }));
  const rows = [...map.values()];
  if (rows.some(r => r.period >= plan.target)) return { forecast: null, reason: 'Hasil bulan target atau sesudahnya sudah diketahui. Pilih rencana rilis mendatang.' };
  const result = fitPpi(rows, plan.target, cutoff);
  if (!result) return { forecast: null, reason: 'Perlu tiga bulan tepat sebelum target dan minimal 12 pasangan pelatihan. Tambahkan angka rilis pertama dari arsip BLS; refresh BLS tidak memperbarui model ini.' };
  return { forecast: { model: 'ppi-ols-mean3-v1', dataset: `${PPI_DATASET.version};manual=${eligible.length}@${eligible.at(-1)?.recordedAt ?? 0}`,
    datasetKnownAt: Math.max(PPI_DATASET.capturedAt, ...eligible.map(r => r.recordedAt)),
    estimatedAt: now, target: plan.target, estimate: result.estimate, consensus: plan.consensus,
    difference: result.estimate - plan.consensus, inputs: result.inputs, fit: result.fit } };
}
function validSnapshot(s: PpiSnapshot): boolean {
  if (!s || !text(s.id) || !validPpiPlan(s.plan) || !s.forecast) return false;
  const f = s.forecast, p = s.plan;
  if (f.model !== 'ppi-ols-mean3-v1' || !text(f.dataset) || f.target !== p.target || f.consensus !== p.consensus
    || !time(f.estimatedAt) || f.estimatedAt < p.at || !time(f.datasetKnownAt) || f.datasetKnownAt > f.estimatedAt
    || f.estimatedAt < p.release - 5 * 3600000 || f.estimatedAt > p.release - 5 * 60000
    || ![f.estimate, f.consensus, f.difference].every(Number.isFinite)
    || !Array.isArray(f.inputs) || f.inputs.length !== 3
    || !f.inputs.every((r, i) => validRow(r) && r.publishedAt <= f.estimatedAt && monthIndex(f.target) - monthIndex(r.period) === 3 - i)
    || !f.fit || ![f.fit.intercept, f.fit.slope].every(Number.isFinite) || !Number.isInteger(f.fit.count) || f.fit.count < 12
    || !validMonth(f.fit.from) || !validMonth(f.fit.through) || f.fit.from > f.fit.through || f.fit.through >= f.target) return false;
  return Math.abs(f.estimate - (f.fit.intercept + f.fit.slope * mean(f.inputs.map(r => r.value)))) < 1e-8
    && Math.abs(f.difference - (f.estimate - f.consensus)) < 1e-8;
}
export function parsePpi(value: unknown): PpiState {
  if (!value || typeof value !== 'object') throw new Error('Data PPI tidak valid.');
  const s = value as PpiState;
  if (s.version !== 1 || s.unit !== 'percent-mom-sa' || s.metric !== 'final-demand-headline'
    || (s.plan !== null && !validPpiPlan(s.plan)) || !Array.isArray(s.releases) || !Array.isArray(s.history)
    || s.releases.some(r => !validRow(r) || !time(r.recordedAt) || r.publishedAt > r.recordedAt)
    || new Set(s.releases.map(r => `${r.period}@${r.recordedAt}`)).size !== s.releases.length
    || !s.history.every(validSnapshot) || new Set(s.history.map(r => r.id)).size !== s.history.length)
    throw new Error('Data PPI rusak atau satuannya tidak sesuai.');
  return s;
}
export const readPpi = (raw: string | null): PpiState => raw === null ? emptyPpi() : parsePpi(JSON.parse(raw));
export function savePpiPlan(state: PpiState, plan: PpiPlan, now: number): PpiState {
  if (!validPpiPlan(plan) || plan.at !== now || !time(now)) throw new Error('Periksa target YYYY-MM, waktu rilis mendatang, dan konsensus persen m/m. Simpan paling lambat T−5 menit.');
  return { ...state, plan: { ...plan } };
}
export function appendPpiRelease(state: PpiState, row: PpiRow, now: number): PpiState {
  if (!validRow(row) || !time(now) || row.publishedAt > now) throw new Error('Isi angka headline m/m rilis pertama, bulan target, waktu publikasi WIB, dan URL arsip PPI BLS. Waktu publikasi harus sudah lewat.');
  if (state.releases.some(r => r.period === row.period && r.recordedAt >= now)) throw new Error('Waktu pencatatan harus lebih baru daripada versi sebelumnya.');
  return { ...state, releases: [...state.releases, { ...row, recordedAt: now }] };
}
export function recordPpi(state: PpiState, now: number): PpiState {
  const plan = state.plan;
  if (!plan || now < plan.release - 5 * 3600000 || now > plan.release - 5 * 60000)
    throw new Error('Catatan PPI hanya bisa disimpan pada T−5 jam sampai T−5 menit.');
  const result = forecastPpi(plan, now, state.releases);
  if (!result.forecast) throw new Error(result.reason);
  const snapshot: PpiSnapshot = { id: `ppi-${plan.release}-${now}`, plan: { ...plan }, forecast: result.forecast };
  if (state.history.some(s => s.id === snapshot.id)) throw new Error('Catatan pada waktu ini sudah tersimpan.');
  return { ...state, history: [snapshot, ...state.history] };
}
