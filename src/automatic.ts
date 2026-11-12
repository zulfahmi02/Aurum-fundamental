import { readMacro, type Macro } from './automaticMacro.ts';
import { newYorkDate, readFedContext, type FedContext } from './automaticFed.ts';
import { analyzeBias, type Bias, type BiasAnalysis } from './automaticBias.ts';
import { readSupport, type Support } from './automaticSupport.ts';
// Shared by Expo and the scheduled backend. No native dependencies or private keys.
export const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const AUTO_KEY = 'aurum-automatic-v1';
export type NewsKind = 'NFP' | 'CPI' | 'PPI' | 'FOMC';
export type Stage = 'morning' | 'five-hours' | 'pre-entry';
export type CalendarItem = { title: string; release: number; forecast: string; previous: string };
export type NewsEvent = { id: string; kind: NewsKind; release: number; items: CalendarItem[] };
export type Calendar = { version: 1; fetchedAt: number; events: NewsEvent[] };
export type AutoReport = {
  version: 1; id: string; event: NewsEvent; stage: Stage; scheduledAt: number; generatedAt: number;
  calendarFetchedAt: number; origin: 'device' | 'server'; bias: Bias; macroFetchedAt?: number;
  analysis?: BiasAnalysis;
  support?: Support;
  macro?: Macro; fed?: FedContext;
  reasons: string[]; missing: string[];
};
export const stageNames: Record<Stage, string> = { morning: 'Laporan pagi', 'five-hours': 'Pembaruan T−5 jam', 'pre-entry': 'Pemeriksaan T−10 menit' };
const HOUR = 3600000, DAY = 24 * HOUR;
const validTime = (t: unknown): t is number => typeof t === 'number' && Number.isSafeInteger(t) && t > 0 && t < 8640000000000000;
const kinds = ['NFP', 'CPI', 'PPI', 'FOMC'];
const mapping: Record<string, NewsKind> = {
  'Non-Farm Employment Change': 'NFP', 'Nonfarm Payrolls': 'NFP', 'Unemployment Rate': 'NFP', 'Average Hourly Earnings m/m': 'NFP',
  'CPI m/m': 'CPI', 'Core CPI m/m': 'CPI', 'CPI y/y': 'CPI',
  'PPI m/m': 'PPI', 'Core PPI m/m': 'PPI',
  'Federal Funds Rate': 'FOMC', 'FOMC Statement': 'FOMC', 'FOMC Economic Projections': 'FOMC',
};
const headline: Record<NewsKind, string[]> = { NFP: ['Non-Farm Employment Change', 'Nonfarm Payrolls'], CPI: ['CPI m/m'], PPI: ['PPI m/m'], FOMC: ['Federal Funds Rate', 'FOMC Statement'] };
export function parseCalendar(value: unknown, fetchedAt: number): Calendar {
  if (!validTime(fetchedAt) || !Array.isArray(value) || value.length > 5000) throw new Error('Format kalender tidak dikenali.');
  const events = new Map<string, NewsEvent>();
  for (const raw of value) {
    if (!raw || raw.country !== 'USD' || typeof raw.title !== 'string' || !Object.hasOwn(mapping, raw.title)) continue;
    if (typeof raw.date !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(raw.date)) throw new Error(`Waktu ${raw.title} belum pasti.`);
    const release = Date.parse(raw.date), kind = mapping[raw.title];
    if (!validTime(release)) throw new Error('Tanggal kalender tidak valid.');
    const offset = raw.date.endsWith('Z') ? 0 : (raw.date.at(-6) === '-' ? -1 : 1)
      * (Number(raw.date.slice(-5, -3)) * 60 + Number(raw.date.slice(-2))) * 60000;
    if (new Date(release + offset).toISOString().slice(0, 19) !== raw.date.slice(0, 19)) throw new Error('Tanggal kalender tidak valid.');
    const id = `${kind}-${release}`;
    const event = events.get(id) ?? { id, kind, release, items: [] };
    const item = { title: raw.title, release, forecast: typeof raw.forecast === 'string' ? raw.forecast.trim().slice(0, 100) : '', previous: typeof raw.previous === 'string' ? raw.previous.trim().slice(0, 100) : '' };
    const duplicate = event.items.find(i => i.title === item.title);
    if (duplicate && JSON.stringify(duplicate) !== JSON.stringify(item)) throw new Error('Kalender memuat nilai ganda yang bertentangan.');
    if (!duplicate) event.items.push(item);
    events.set(id, event);
  }
  // Never turn speeches, minutes, a press conference, or a standalone component into a decision event.
  return { version: 1, fetchedAt, events: [...events.values()].filter(e => e.items.some(i => headline[e.kind].includes(i.title))).sort((a, b) => a.release - b.release) };
}
export function readCalendar(value: unknown): Calendar {
  const c = value as Calendar;
  if (!c || c.version !== 1 || !validTime(c.fetchedAt) || !Array.isArray(c.events) || c.events.length > 100
    || new Set(c.events.map(e => e?.id)).size !== c.events.length) throw new Error('Cache kalender tidak valid.');
  for (const e of c.events) {
    if (!e || !kinds.includes(e.kind) || !validTime(e.release) || e.id !== `${e.kind}-${e.release}` || !Array.isArray(e.items)
      || !e.items.length || e.items.length > 10 || new Set(e.items.map(i => i?.title)).size !== e.items.length
      || !e.items.every(i => i && mapping[i.title] === e.kind && i.release === e.release && typeof i.forecast === 'string' && i.forecast.length <= 100 && typeof i.previous === 'string' && i.previous.length <= 100)
      || !e.items.some(i => headline[e.kind].includes(i.title))) throw new Error('Isi kalender tidak valid.');
  }
  return c;
}
export function reportSchedule(release: number): { stage: Stage; at: number }[] {
  if (!validTime(release)) throw new Error('Waktu rilis tidak valid.');
  // 07:00 WIB is 00:00 UTC. For 01:00/02:00 WIB FOMC, use the preceding morning.
  const wibDay = Math.floor((release + 7 * HOUR) / DAY) * DAY;
  const morning = wibDay >= release ? wibDay - DAY : wibDay;
  const stages: { stage: Stage; at: number }[] = [{ stage: 'morning', at: morning }, { stage: 'five-hours', at: release - 5 * HOUR }, { stage: 'pre-entry', at: release - 10 * 60000 }];
  return stages.sort((a, b) => a.at - b.at);
}
export function dueStage(release: number, now: number) {
  if (!validTime(now) || now > release - 5 * 60000) return null;
  return reportSchedule(release).filter(s => s.at <= now).at(-1) ?? null;
}
export function consensusNumber(raw: string): { value: number; unit: '%' | 'K' | 'number' } | null {
  const match = raw.match(/^([+-]?\d+(?:\.\d+)?)(%|K|M)?$/);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] === 'M' ? 1000 : 1);
  return { value, unit: match[2] === '%' ? '%' : match[2] === 'K' || match[2] === 'M' ? 'K' : 'number' };
}
export function makeAutoReport(event: NewsEvent, calendarFetchedAt: number, now: number, origin: AutoReport['origin'], macro?: Macro | null, fed?: FedContext | null, support?: Support | null): AutoReport | null {
  readCalendar({ version: 1, fetchedAt: calendarFetchedAt, events: [event] });
  const due = dueStage(event.release, now);
  if (!due || calendarFetchedAt > now || calendarFetchedAt > event.release - 5 * 60000) return null;
  const missing: string[] = [];
  if (now - calendarFetchedAt > 2 * HOUR) missing.push('Kalender lebih dari dua jam; jadwal dan konsensus perlu diperbarui.');
  const reasons = event.items.map(item => {
    if (['FOMC Statement', 'FOMC Economic Projections'].includes(item.title)) return `${item.title}: isi dokumen baru tersedia saat rilis.`;
    const f = consensusNumber(item.forecast), p = consensusNumber(item.previous);
    if (!f) { missing.push(`Konsensus ${item.title} belum tersedia.`); return `${item.title}: nilai sebelumnya ${item.previous || 'belum tersedia'}.`; }
    const comparison = p && p.unit === f.unit ? ` (${f.value > p.value ? 'lebih tinggi dari' : f.value < p.value ? 'lebih rendah dari' : 'sama dengan'} nilai sebelumnya ${item.previous})` : '';
    return `${item.title}: konsensus ${item.forecast}${comparison}.`;
  });
  reasons.push('Konsensus adalah ekspektasi pasar. Selisih terhadap previous bukan surprise aktual dan tidak langsung menentukan BUY/SELL emas.');
  if (event.kind === 'FOMC') reasons.push('Keputusan suku bunga, isi pernyataan dan proyeksi harus dibaca bersama. Konferensi pers setelah keputusan adalah event terpisah dari exit T+1 menit.');
  else reasons.push('Angka actual dan komponen laporan baru diketahui saat publikasi; data sebelum rilis tidak menjamin respons XAUUSD.');
  if (macro && macro.fetchedAt <= now && macro.fetchedAt <= event.release - 5 * 60000) {
    readMacro(macro);
    reasons.push(...macro.observations.map(o => `${o.label}: ${o.value} ${o.unit} (${o.period}, versi terbaru BLS termasuk revisi).`));
    missing.push(...macro.missing);
    if (now - macro.fetchedAt > 6 * HOUR) missing.push('Konteks BLS belum diperbarui lebih dari enam jam.');
  } else missing.push('Konteks BLS sebelum cutoff belum tersedia.');
  let fedSnapshot: FedContext | undefined;
  if (fed) {
    readFedContext(fed);
    fedSnapshot = { version: 1, calendar: fed.calendar && fed.calendar.fetchedAt <= now ? fed.calendar : null,
      rates: fed.rates && fed.rates.fetchedAt <= now ? fed.rates : null, errors: [...fed.errors] };
  }
  if (event.kind === 'FOMC') {
    const matched = fedSnapshot?.calendar?.meetings.some(m => m.date === newYorkDate(event.release));
    if (matched) reasons.push('Tanggal rapat cocok dengan kalender resmi Fed. Jam keputusan tetap mengikuti feed; kalender rapat tidak mengonfirmasi jamnya.');
    else missing.push('Tanggal FOMC belum cocok dengan kalender rapat resmi; rapat di luar jadwal atau perubahan perlu diperiksa.');
    if (fedSnapshot?.calendar && now - fedSnapshot.calendar.fetchedAt > 48 * HOUR) missing.push('Kalender resmi Fed belum diperbarui lebih dari dua hari.');
    const rates = fedSnapshot?.rates;
    if (rates) {
      reasons.push(`Rentang target Fed yang berlaku ${rates.period}: ${rates.lower}–${rates.upper}%. Ini posisi kebijakan saat ini, bukan prediksi keputusan.`);
      const expectedRate = consensusNumber(event.items.find(i => i.title === 'Federal Funds Rate')?.forecast ?? '');
      if (expectedRate?.unit === '%') {
        const change = Math.round((expectedRate.value - rates.upper) * 10000) / 100;
        reasons.push(change === 0 ? 'Angka konsensus sama dengan batas atas target saat ini: ekspektasi menahan suku bunga, bukan kejutan baru.'
          : `Dibanding batas atas saat ini, angka konsensus menyiratkan ${change > 0 ? 'kenaikan' : 'penurunan'} ${Math.abs(change)} basis poin. Ekspektasi ini sendiri belum menentukan arah emas.`);
      }
      if (now - rates.fetchedAt > 6 * HOUR || Date.parse(newYorkDate(now)) - Date.parse(rates.period) > 3 * DAY) missing.push('Data rentang suku bunga belum mutakhir.');
    } else missing.push('Rentang suku bunga Fed belum tersedia.');
    missing.push(...(fedSnapshot?.errors ?? []));
  } else missing.push('Jadwal/konsensus berasal dari Forex Factory/Fair Economy; pencocokan otomatis dengan kalender BLS belum aktif.');
  const macroSnapshot = macro && macro.fetchedAt <= now && macro.fetchedAt <= event.release - 5 * 60000 ? macro : undefined;
  const analysis = analyzeBias(event, calendarFetchedAt, now, macroSnapshot, fedSnapshot);
  if (support) readSupport(support);
  missing.push('Bias eksperimen berbasis aturan; akurasi arah XAUUSD T−5 sampai T+1 belum tervalidasi.');
  return { version: 1, id: `${event.id}-${due.stage}`, event: JSON.parse(JSON.stringify(event)), stage: due.stage,
    scheduledAt: due.at, generatedAt: now, calendarFetchedAt, origin, bias: analysis.bias, analysis,
    ...(support && support.checkedAt <= now ? { support: JSON.parse(JSON.stringify(support)) } : {}),
    ...(macro && macro.fetchedAt <= now && macro.fetchedAt <= event.release - 5 * 60000 ? { macroFetchedAt: macro.fetchedAt, macro: JSON.parse(JSON.stringify(macro)) } : {}),
    ...(fedSnapshot ? { fed: JSON.parse(JSON.stringify(fedSnapshot)) } : {}), reasons, missing };
}
export function readAutoReport(value: unknown): AutoReport {
  const r = value as AutoReport;
  if (!r || r.version !== 1 || !['device', 'server'].includes(r.origin) || !['BUY', 'SELL', 'NEUTRAL', 'NO_SIGNAL'].includes(r.bias)
    || (r.macroFetchedAt !== undefined && (!validTime(r.macroFetchedAt) || r.macroFetchedAt > r.generatedAt))
    || !validTime(r.generatedAt) || !validTime(r.scheduledAt) || !validTime(r.calendarFetchedAt)
    || !Array.isArray(r.reasons) || !Array.isArray(r.missing) || r.reasons.length > 30 || r.missing.length > 30
    || ![...r.reasons, ...r.missing].every(s => typeof s === 'string' && s.length <= 2000)) throw new Error('Laporan otomatis tidak valid.');
  const expected = makeAutoReport(r.event, r.calendarFetchedAt, r.generatedAt, r.origin);
  if (!expected || r.id !== expected.id || r.stage !== expected.stage || r.scheduledAt !== expected.scheduledAt) throw new Error('Waktu laporan otomatis tidak valid.');
  if (r.macro !== undefined && readMacro(r.macro).fetchedAt !== r.macroFetchedAt) throw new Error('Timestamp konteks BLS tidak cocok.');
  if (r.fed !== undefined) {
    const fed = readFedContext(r.fed);
    if ([fed.calendar?.fetchedAt, fed.rates?.fetchedAt].some(t => t !== undefined && t > r.generatedAt)) throw new Error('Data Fed sesudah cutoff tidak boleh masuk laporan.');
  }
  if (r.analysis !== undefined) {
    const expectedAnalysis = analyzeBias(r.event, r.calendarFetchedAt, r.generatedAt, r.macro, r.fed);
    if (!r.analysis || r.bias !== expectedAnalysis.bias || Object.keys(expectedAnalysis).some(key =>
      JSON.stringify(r.analysis![key as keyof BiasAnalysis]) !== JSON.stringify(expectedAnalysis[key as keyof BiasAnalysis]))) throw new Error('Bias tidak cocok dengan aturan dan data snapshot.');
  } else if (r.bias !== 'NO_SIGNAL') throw new Error('Bias arah harus disertai analisis yang dapat diperiksa.');
  if (r.support !== undefined && readSupport(r.support).checkedAt > r.generatedAt) throw new Error('Konteks pendukung sesudah snapshot ditolak.');
  return r;
}
export async function fetchCalendar(): Promise<Calendar> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(CALENDAR_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Kalender HTTP ${response.status}`);
    const raw = await response.text();
    if (raw.length > 1500000) throw new Error('Respons kalender terlalu besar.');
    return parseCalendar(JSON.parse(raw), Date.now());
  } finally { clearTimeout(timer); }
}
