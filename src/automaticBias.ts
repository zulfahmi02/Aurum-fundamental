import type { NewsEvent } from './automatic.ts';
import { readMacro, type Macro } from './automaticMacro.ts';
import { newYorkDate, readFedContext, type FedContext } from './automaticFed.ts';

// Versioned, deliberately simple scenario rules, NOT a fitted price model.
export const BIAS_MODEL = 'fundamental-scenario-v1' as const;
export type Bias = 'BUY' | 'SELL' | 'NEUTRAL' | 'NO_SIGNAL';
export type BiasAnalysis = {
  model: typeof BIAS_MODEL; experimental: true; bias: Bias;
  method: 'persistence-vs-consensus' | 'policy-context';
  reasons: string[]; blockers: string[];
};
export const biasNames: Record<Bias, string> = { BUY: 'BUY · bias eksperimen', SELL: 'SELL · bias eksperimen', NEUTRAL: 'NETRAL · belum ada arah dominan', NO_SIGNAL: 'BELUM ADA SINYAL · data belum memadai' };
const HOUR = 3600000, DAY = 24 * HOUR;
const periodNumber = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7));
const round = (n: number) => Math.round(n * 10000) / 10000;
const direction = (difference: number, threshold: number) => Math.abs(round(difference)) < threshold ? 0 : difference > 0 ? -1 : 1;
const voteName = (n: number) => n > 0 ? 'mendukung BUY' : n < 0 ? 'mendukung SELL' : 'netral';
const number = (s: string, unit: '%' | 'K') => {
  const m = s.match(unit === '%' ? /^([+-]?\d+(?:\.\d+)?)%$/ : /^([+-]?\d+(?:\.\d+)?)(K|M)$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === 'M' ? 1000 : 1);
  return Number.isFinite(n) ? n : null;
};
type Component = { id: string; titles: string[]; unit: '%' | 'K'; threshold: number; inverse?: boolean };
const components: Record<'NFP' | 'CPI' | 'PPI', Component[]> = {
  NFP: [
    { id: 'CES0000000001', titles: ['Non-Farm Employment Change', 'Nonfarm Payrolls'], unit: 'K', threshold: 50 },
    { id: 'LNS14000000', titles: ['Unemployment Rate'], unit: '%', threshold: 0.1, inverse: true },
    { id: 'CES0500000003', titles: ['Average Hourly Earnings m/m'], unit: '%', threshold: 0.1 },
  ],
  CPI: [
    { id: 'CUSR0000SA0', titles: ['CPI m/m'], unit: '%', threshold: 0.1 },
    { id: 'CUSR0000SA0L1E', titles: ['Core CPI m/m'], unit: '%', threshold: 0.1 },
  ],
  PPI: [
    { id: 'WPSFD4', titles: ['PPI m/m'], unit: '%', threshold: 0.1 },
    { id: 'WPSFD49104', titles: ['Core PPI m/m'], unit: '%', threshold: 0.1 },
  ],
};

export function analyzeBias(event: NewsEvent, calendarFetchedAt: number, now: number, macro?: Macro | null, fed?: FedContext | null): BiasAnalysis {
  const result: BiasAnalysis = { model: BIAS_MODEL, experimental: true, bias: 'NO_SIGNAL',
    method: event.kind === 'FOMC' ? 'policy-context' : 'persistence-vs-consensus', reasons: [], blockers: [] };
  const { reasons, blockers } = result;
  if (!Number.isSafeInteger(now) || now <= 0 || now > event.release - 5 * 60000) blockers.push('Analisis hanya dibuat sebelum atau tepat pada cutoff T−5 menit.');
  if (!Number.isSafeInteger(calendarFetchedAt) || calendarFetchedAt <= 0 || calendarFetchedAt > now || now - calendarFetchedAt > 2 * HOUR) blockers.push('Kalender/konsensus belum mutakhir sebelum waktu analisis.');
  if (!macro) blockers.push('Data BLS belum tersedia.');
  else {
    readMacro(macro);
    if (macro.fetchedAt > now || now - macro.fetchedAt > 6 * HOUR) blockers.push('Data BLS belum mutakhir sebelum waktu analisis.');
  }
  if (blockers.length || !macro) return result;
  const releaseMonth = periodNumber(newYorkDate(event.release));
  const observation = (id: string, expectedAge?: number) => {
    const o = macro.observations.find(row => row.id === id);
    if (!o) { blockers.push(`Seri ${id} belum tersedia.`); return null; }
    const age = releaseMonth - periodNumber(o.period);
    // Monthly event assumes next publication covers the preceding month. Delayed
    // releases cannot be inferred from this calendar and must fail closed.
    if (expectedAge !== undefined ? age !== expectedAge : age < 1 || age > 2) {
      blockers.push(`${o.label}: periode ${o.period} tidak sesuai asumsi periode sebelum rilis; kemungkinan jadwal tertunda/data belum mutakhir.`); return null;
    }
    return o;
  };
  const votes: number[] = [];
  if (event.kind !== 'FOMC') {
    reasons.push('Skenario persistensi: andaikan angka bulan berikutnya sama dengan observasi BLS terakhir. Ini baseline sederhana, bukan estimasi terlatih atau actual.');
    for (const c of components[event.kind]) {
      const o = observation(c.id, 2);
      const items = event.items.filter(i => c.titles.includes(i.title));
      const forecasts = items.map(i => number(i.forecast, c.unit));
      const forecast = forecasts[0];
      if (forecast === null || forecast === undefined || forecasts.some(f => f !== forecast)) {
        blockers.push(`Konsensus ${c.titles[0]} tidak tersedia, salah satuan, atau bertentangan.`); continue;
      }
      if (!o) continue;
      const delta = round(o.value - forecast);
      const vote = direction(delta, c.threshold) * (c.inverse ? -1 : 1);
      votes.push(vote);
      reasons.push(`${o.label} (${o.period}): skenario ${o.value}${c.unit} vs konsensus ${forecast}${c.unit}, selisih ${delta}; ${voteName(vote)}. Ambang aturan ${c.threshold} ${c.unit === '%' ? 'poin persentase' : 'ribu pekerjaan'}.`);
    }
    reasons.push('Asumsi arah: tekanan inflasi/tenaga kerja di atas ekspektasi dapat mendukung USD/suku bunga dan menekan emas; pengangguran dibaca terbalik. Hubungan ini dapat gagal.');
  } else {
    reasons.push('FOMC memakai konteks kebijakan, bukan prediksi keputusan atau surprise terhadap harga pasar. Konsensus naik/turun suku bunga tidak otomatis menjadi BUY/SELL.');
    if (fed) readFedContext(fed);
    if (!fed?.calendar || fed.calendar.fetchedAt > now || now - fed.calendar.fetchedAt > 48 * HOUR || !fed.calendar.meetings.some(m => m.date === newYorkDate(event.release))) blockers.push('Tanggal rapat belum terverifikasi dengan kalender resmi Fed yang mutakhir.');
    if (!fed?.rates || fed.rates.fetchedAt > now || now - fed.rates.fetchedAt > 6 * HOUR || Date.parse(newYorkDate(now)) - Date.parse(fed.rates.period) > 3 * DAY || fed.rates.period > newYorkDate(now)) blockers.push('Rentang target Fed belum mutakhir.');
    const expected = number(event.items.find(i => i.title === 'Federal Funds Rate')?.forecast ?? '', '%');
    if (expected === null) blockers.push('Konsensus suku bunga belum tersedia.');
    const core = observation('CUSR0000SA0L1E'), payroll = observation('CES0000000001'), wages = observation('CES0500000003');
    if (payroll && wages && payroll.period !== wages.period) blockers.push('Periode payroll dan upah tidak sama.');
    for (const [o, low, high] of [[core, 0.2, 0.3], [payroll, 100, 200], [wages, 0.2, 0.3]] as const) {
      if (!o) continue;
      const vote = o.value <= low ? 1 : o.value >= high ? -1 : 0;
      votes.push(vote);
      reasons.push(`${o.label} (${o.period}): ${o.value} ${o.unit}; ${voteName(vote)} dalam skenario kebijakan. Batas heuristik ≤${low} / ≥${high}, bukan ambang resmi Fed.`);
    }
    reasons.push('CPI bukan target inflasi resmi Fed (target memakai PCE). PCE, pricing futures, isi statement dan dot plot belum dimodelkan. Bias ini hanya konteks, bukan prediksi reaksi satu menit.');
  }
  reasons.push('Kekuatan prediksi belum diketahui: tidak ada persentase akurasi/keyakinan. Asumsi serta ambang belum divalidasi pada XAUUSD HFM/Exness T−5 sampai T+1.');
  if (blockers.length) return result;
  const buy = votes.filter(v => v > 0).length, sell = votes.filter(v => v < 0).length;
  // Require an anchor: payroll for NFP; both inflation and payroll for FOMC.
  const anchor = event.kind === 'FOMC' ? votes[0] !== 0 && votes[0] === votes[1] : votes[0] !== 0;
  result.bias = anchor && buy >= 2 && sell === 0 ? 'BUY' : anchor && sell >= 2 && buy === 0 ? 'SELL' : 'NEUTRAL';
  reasons.push(result.bias === 'NEUTRAL' ? 'Indikator bertentangan atau belum cukup searah melewati ambang; tidak ada arah dominan.' : 'Sedikitnya dua komponen searah dan tidak ada komponen yang berlawanan. Komponen saling berkorelasi, bukan bukti independen atau probabilitas keberhasilan.');
  return result;
}
