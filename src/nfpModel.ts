import { NFP_DATASET } from './data/nfpFirst';
import { knowledgeCutoff, monthIndex, validMonth, validTargetMonth } from './periods';
import type { Plan } from './review';
import { FirstRelease, modelDataset } from './research';

export type NfpRow = { period: string; value: number };
export type NfpFit = { intercept: number; slope: number; count: number; from: string; through: string };
export type NfpForecast = {
  model: 'nfp-ols-mean3-v1'; dataset: string; estimatedAt: number; target: string;
  estimate: number; consensus: number; difference: number; inputs: NfpRow[]; fit: NfpFit;
};
export type NfpResult = { forecast: NfpForecast; reason?: never } | { forecast: null; reason: string };
const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const MIN_TRAINING = 12;

function checked(rows: readonly NfpRow[]): NfpRow[] {
  if (rows.some(r => !validMonth(r.period) || !Number.isFinite(r.value))
    || new Set(rows.map(r => r.period)).size !== rows.length) throw new Error('Dataset NFP tidak valid.');
  return [...rows].sort((a, b) => a.period.localeCompare(b.period));
}

function lags(rows: readonly NfpRow[], target: string): NfpRow[] | null {
  const inputs = rows.filter(r => r.period < target).slice(-3);
  return inputs.length === 3 && inputs.every((r, i) => monthIndex(target) - monthIndex(r.period) === 3 - i)
    ? inputs.map(r => ({ ...r })) : null;
}

// Expanding-window OLS: y = intercept + slope * mean(first-release NFP of last 3 months).
// Target and future observations never enter either the inputs or the fit.
export function fitNfp(rows: readonly NfpRow[], target: string) {
  if (!validMonth(target)) throw new Error('Bulan target NFP tidak valid.');
  const past = checked(rows).filter(r => r.period < target);
  const inputs = lags(past, target);
  if (!inputs) return null;
  const training = past.flatMap(row => {
    const previous = lags(past, row.period);
    return previous ? [{ period: row.period, x: mean(previous.map(r => r.value)), y: row.value }] : [];
  });
  if (training.length < MIN_TRAINING) return null;
  const xMean = mean(training.map(r => r.x)), yMean = mean(training.map(r => r.y));
  const variance = training.reduce((sum, r) => sum + (r.x - xMean) ** 2, 0);
  // A constant predictor carries no slope information; fit the training target mean.
  const slope = variance === 0 ? 0 : training.reduce((sum, r) => sum + (r.x - xMean) * (r.y - yMean), 0) / variance;
  const intercept = yMean - slope * xMean;
  const baseline = mean(inputs.map(r => r.value));
  const estimate = intercept + slope * baseline;
  if (![slope, intercept, estimate].every(Number.isFinite)) return null;
  const fit: NfpFit = { intercept, slope, count: training.length, from: training[0].period, through: training[training.length - 1].period };
  return { estimate, baseline, inputs, fit };
}

// Research simulation by reference month, NOT a verified T−5 minute event-time backtest.
// No random split, tuning on the evaluation period, consensus series, or gold prices.
export function evaluateNfp(rows: readonly NfpRow[], from: string, through: string) {
  if (!validMonth(from) || !validMonth(through) || from > through) throw new Error('Periode evaluasi tidak valid.');
  const data = checked(rows);
  const predictions = data.filter(r => r.period >= from && r.period <= through).flatMap(row => {
    const result = fitNfp(data, row.period);
    return result ? [{ target: row.period, actual: row.value, estimate: result.estimate,
      baseline: result.baseline, trainingThrough: result.fit.through, trainingCount: result.fit.count }] : [];
  });
  const count = predictions.length;
  const metrics = (key: 'estimate' | 'baseline') => count ? {
    mae: mean(predictions.map(p => Math.abs(p[key] - p.actual))),
    rmse: Math.sqrt(mean(predictions.map(p => (p[key] - p.actual) ** 2))),
    bias: mean(predictions.map(p => p[key] - p.actual)),
  } : null;
  return { from, through, count, missingOrSkipped: monthIndex(through) - monthIndex(from) + 1 - count,
    model: metrics('estimate'), baseline: metrics('baseline'), predictions };
}

// Fixed initial research evaluation period. Later observations cannot alter this result.
export const NFP_EVALUATION = evaluateNfp(NFP_DATASET.rows, '2024-01', '2024-12');
export const NFP_RECENT_EVALUATION = evaluateNfp(NFP_DATASET.rows, '2025-01', '2026-10');

export function forecastNfp(plan: Plan | null, now: number, releases: FirstRelease[] = []): NfpResult {
  if (!plan || !validTargetMonth(plan.targetMonth, plan.release) || !Number.isFinite(plan.forecast)
    || !Number.isFinite(plan.at) || plan.at <= 0 || !Number.isFinite(now))
    return { forecast: null, reason: 'Simpan rencana NFP dengan bulan target dan konsensus terlebih dahulu.' };
  const cutoff = knowledgeCutoff(plan.release, now);
  if (now > plan.release - 5 * 60000)
    return { forecast: null, reason: 'Batas T−5 menit sudah lewat. Lihat estimasi yang telah disimpan di catatan persiapan.' };
  if (plan.at > cutoff || NFP_DATASET.capturedAt > cutoff)
    return { forecast: null, reason: 'Rencana atau dataset belum tersedia pada batas waktu analisis ini.' };
  const dataset = modelDataset(releases, cutoff);
  if (dataset.rows.some(row => row.period >= plan.targetMonth!))
    return { forecast: null, reason: 'Dataset sudah mencakup bulan target atau sesudahnya. Gunakan rencana rilis mendatang.' };
  const result = fitNfp(dataset.rows, plan.targetMonth);
  if (!result) return { forecast: null, reason: 'Dataset belum memuat tiga bulan tepat sebelum target atau data pelatihan cukup. Perbarui dataset rilis pertama; refresh BLS tidak memperbarui dataset model.' };
  return { forecast: { model: 'nfp-ols-mean3-v1', dataset: dataset.version, estimatedAt: now,
    target: plan.targetMonth, estimate: result.estimate, consensus: plan.forecast,
    difference: result.estimate - plan.forecast, inputs: result.inputs, fit: result.fit } };
}

export function validNfpForecast(value: unknown): value is NfpForecast {
  if (!value || typeof value !== 'object') return false;
  const f = value as NfpForecast;
  if (f.model !== 'nfp-ols-mean3-v1' || typeof f.dataset !== 'string' || !f.dataset
    || !validMonth(f.target) || !Number.isFinite(f.estimatedAt) || f.estimatedAt <= 0
    || ![f.estimate, f.consensus, f.difference].every(Number.isFinite)
    || !Array.isArray(f.inputs) || f.inputs.length !== 3
    || !f.inputs.every((r, i) => r && validMonth(r.period) && Number.isFinite(r.value)
      && monthIndex(f.target) - monthIndex(r.period) === 3 - i)
    || !f.fit || ![f.fit.intercept, f.fit.slope].every(Number.isFinite)
    || !Number.isInteger(f.fit.count) || f.fit.count < MIN_TRAINING
    || !validMonth(f.fit.from) || !validMonth(f.fit.through) || f.fit.from > f.fit.through || f.fit.through >= f.target) return false;
  return Math.abs(f.estimate - (f.fit.intercept + f.fit.slope * mean(f.inputs.map(r => r.value)))) < 1e-8
    && Math.abs(f.difference - (f.estimate - f.consensus)) < 1e-8;
}
