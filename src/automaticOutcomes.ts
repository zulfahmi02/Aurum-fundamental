import { consensusNumber, readAutoReport, type AutoReport } from './automatic.ts';
import { readMacro, type Macro } from './automaticMacro.ts';
import { newYorkDate, type FedDecision } from './automaticFed.ts';

export type AutoOutcome = {
  version: 1; id: string; eventId: string; reportId: string; kind: AutoReport['event']['kind']; release: number;
  quality: 'official-statement' | 'post-release-observation'; capturedAt: number; publishedAt?: number;
  period: string; value: number; lower?: number; consensus: number | null; difference: number | null;
  unit: '%' | 'K'; source: string; note: string;
};
const headline = { NFP: { series: 'CES0000000001', titles: ['Non-Farm Employment Change', 'Nonfarm Payrolls'], unit: 'K' },
  CPI: { series: 'CUSR0000SA0', titles: ['CPI m/m'], unit: '%' }, PPI: { series: 'WPSFD4', titles: ['PPI m/m'], unit: '%' } } as const;
export function latestPreparation(reports: AutoReport[]): AutoReport[] {
  const events = new Map<string, AutoReport>();
  for (const r of reports) {
    readAutoReport(r);
    if (r.origin !== 'server') continue;
    const prior = events.get(r.event.id);
    if (!prior || r.generatedAt > prior.generatedAt) events.set(r.event.id, r);
  }
  return [...events.values()];
}
function baseline(report: AutoReport, titles: readonly string[], unit: AutoOutcome['unit']) {
  const raw = report.event.items.find(i => titles.includes(i.title))?.forecast ?? '';
  const parsed = consensusNumber(raw);
  return parsed?.unit === unit ? parsed.value : null;
}
export function observeBlsRelease(report: AutoReport, macro: Macro, now: number): AutoOutcome | null {
  readAutoReport(report); readMacro(macro);
  if (!Number.isSafeInteger(now) || now <= 0 || report.origin !== 'server' || report.event.kind === 'FOMC' || !report.macro || now < report.event.release
    || macro.fetchedAt < report.event.release || macro.fetchedAt > now || now > report.event.release + 72 * 3600000) return null;
  const definition = headline[report.event.kind];
  const prior = report.macro.observations.find(o => o.id === definition.series);
  const current = macro.observations.find(o => o.id === definition.series);
  if (!prior || !current) return null;
  const expected = new Date(`${prior.period}-01T00:00:00Z`);
  expected.setUTCMonth(expected.getUTCMonth() + 1);
  // No guessed target from the release month; only an unambiguous one-month advance
  // from the value frozen before this event. A gap/revision alone yields no result.
  if (current.period !== expected.toISOString().slice(0, 7) || current.period >= new Date(report.event.release).toISOString().slice(0, 7)) return null;
  const consensus = baseline(report, definition.titles, definition.unit);
  return { version: 1, id: `${report.event.id}-result`, eventId: report.event.id, reportId: report.id,
    kind: report.event.kind, release: report.event.release, quality: 'post-release-observation', capturedAt: macro.fetchedAt,
    period: current.period, value: current.value, consensus, difference: consensus === null ? null : current.value - consensus,
    unit: definition.unit, source: `https://api.bls.gov/publicAPI/v1/timeseries/data/${definition.series}`,
    note: 'Periode baru teramati setelah jadwal rilis. API BLS memuat versi terbaru termasuk revisi; ini belum terverifikasi sebagai angka rilis pertama. Tidak digunakan untuk menilai akurasi sinyal atau melatih model rilis pertama.' };
}
export function matchFedDecision(report: AutoReport, decision: FedDecision, now: number): AutoOutcome | null {
  readAutoReport(report);
  if (!Number.isSafeInteger(now) || now <= 0 || !Number.isSafeInteger(decision.capturedAt)
    || report.origin !== 'server' || report.event.kind !== 'FOMC' || decision.publishedAt !== report.event.release
    || decision.capturedAt < decision.publishedAt || decision.capturedAt > now || decision.date !== newYorkDate(report.event.release)
    || decision.source !== `https://www.federalreserve.gov/newsevents/pressreleases/monetary${decision.date.replaceAll('-', '')}a.htm`
    || ![decision.lower, decision.upper].every(Number.isFinite) || decision.lower < 0 || decision.upper > 100 || decision.lower > decision.upper) return null;
  const consensus = baseline(report, ['Federal Funds Rate'], '%');
  return { version: 1, id: `${report.event.id}-result`, eventId: report.event.id, reportId: report.id,
    kind: 'FOMC', release: report.event.release, quality: 'official-statement', capturedAt: decision.capturedAt, publishedAt: decision.publishedAt,
    period: decision.date, value: decision.upper, lower: decision.lower, consensus,
    difference: consensus === null ? null : decision.upper - consensus, unit: '%', source: decision.source,
    note: 'Rentang target diambil dari pernyataan resmi Fed. Perbandingan memakai batas atas terhadap angka konsensus kalender. Isi pernyataan/proyeksi dan respons XAUUSD belum dinilai oleh selisih ini.' };
}
export function readAutoOutcome(value: unknown): AutoOutcome {
  const o = value as AutoOutcome;
  if (!o || o.version !== 1 || !['NFP', 'CPI', 'PPI', 'FOMC'].includes(o.kind)
    || !Number.isSafeInteger(o.release) || o.release <= 0 || !Number.isSafeInteger(o.capturedAt) || o.capturedAt < o.release
    || o.eventId !== `${o.kind}-${o.release}` || o.id !== `${o.eventId}-result`
    || !['morning', 'five-hours', 'pre-entry'].some(s => o.reportId === `${o.eventId}-${s}`)
    || !Number.isFinite(o.value) || (o.consensus !== null && !Number.isFinite(o.consensus))
    || (o.consensus === null ? o.difference !== null : !Number.isFinite(o.difference) || Math.abs(o.difference! - (o.value - o.consensus)) > 1e-8)
    || typeof o.note !== 'string' || !o.note || o.note.length > 2000) throw new Error('Hasil rilis tidak valid.');
  if (o.kind === 'FOMC') {
    if (o.quality !== 'official-statement' || o.publishedAt !== o.release || o.period !== newYorkDate(o.release)
      || o.unit !== '%' || !Number.isFinite(o.lower) || o.lower! < 0 || o.lower! > o.value || o.value > 100
      || o.source !== `https://www.federalreserve.gov/newsevents/pressreleases/monetary${o.period.replaceAll('-', '')}a.htm`) throw new Error('Hasil FOMC tidak valid.');
  } else if (o.quality !== 'post-release-observation' || o.publishedAt !== undefined || o.lower !== undefined
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(o.period) || o.period >= new Date(o.release).toISOString().slice(0, 7)
    || o.capturedAt > o.release + 72 * 3600000 || o.unit !== headline[o.kind].unit
    || o.source !== `https://api.bls.gov/publicAPI/v1/timeseries/data/${headline[o.kind].series}`) throw new Error('Observasi BLS tidak valid.');
  return o;
}
