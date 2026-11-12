import { NFP_DATASET } from './data/nfpFirst';
import { validMonth, validTargetMonth } from './periods';
import type { Snapshot } from './review';

export const RESEARCH_KEY = 'aurum-research-v1';
export type Broker = 'HFM' | 'Exness';
export type FirstRelease = { id: string; period: string; value: number; publishedAt: number; recordedAt: number; source: string };
export type Quote = { at: number; bid: number; ask: number };
export type Outcome = { id: string; release: number; broker: Broker; feed: string; symbol: string;
  entry: Quote; exit: Quote; cost: number; source: string; recordedAt: number };
export const FEATURES = ['nfpMean3', 'adp', 'ismManufacturing', 'ismServices', 'claims4w', 'unemployment', 'wages', 'consensus'] as const;
export type Feature = typeof FEATURES[number];
export type KnownValue = { value: number; period: string; publishedAt: number; knownAt: number; source: string };
export type ResearchEvent = { id: string; target: string; release: number; capturedAt: number;
  features: Record<Feature, KnownValue>; actual: FirstRelease };
export type Research = { version: 1; releases: FirstRelease[]; outcomes: Outcome[]; events: ResearchEvent[] };
export const emptyResearch = (): Research => ({ version: 1, releases: [], outcomes: [], events: [] });
export const validTime = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n < 8640000000000000;
const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 500;
const https = (s: unknown): s is string => {
  if (!text(s)) return false;
  try { return new URL(s).protocol === 'https:'; } catch { return false; }
};
export function validFirstRelease(value: unknown): value is FirstRelease {
  if (!value || typeof value !== 'object') return false;
  const r = value as FirstRelease;
  if (!text(r.id) || !validMonth(r.period) || !Number.isFinite(r.value) || !validTime(r.publishedAt)
    || !validTime(r.recordedAt) || r.publishedAt > r.recordedAt || !validTargetMonth(r.period, r.publishedAt) || !https(r.source)) return false;
  const host = new URL(r.source).hostname;
  return host === 'bls.gov' || host.endsWith('.bls.gov');
}
function validQuote(q: Quote): boolean {
  return !!q && validTime(q.at) && Number.isFinite(q.bid) && Number.isFinite(q.ask) && q.bid > 0 && q.ask >= q.bid;
}
export function validOutcome(value: unknown): value is Outcome {
  if (!value || typeof value !== 'object') return false;
  const r = value as Outcome;
  return text(r.id) && validTime(r.release) && (r.broker === 'HFM' || r.broker === 'Exness')
    && text(r.feed) && !r.feed.includes('\n') && text(r.symbol) && /^XAUUSD[^\s]*$/i.test(r.symbol) && validQuote(r.entry) && validQuote(r.exit)
    // First quote at or after each boundary, maximum five seconds late. Never silently use stale prices.
    && r.entry.at >= r.release - 300000 && r.entry.at <= r.release - 295000
    && r.exit.at >= r.release + 60000 && r.exit.at <= r.release + 65000
    && Number.isFinite(r.cost) && r.cost >= 0 && text(r.source)
    && validTime(r.recordedAt) && r.recordedAt >= r.exit.at;
}
export function validResearchEvent(value: unknown): value is ResearchEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as ResearchEvent;
  if (!text(e.id) || !validTime(e.release) || !validTargetMonth(e.target, e.release)
    || !validTime(e.capturedAt) || !e.features || !validFirstRelease(e.actual)
    || e.actual.period !== e.target || e.actual.publishedAt !== e.release || e.capturedAt < e.actual.recordedAt) return false;
  return FEATURES.every(key => {
    const f = e.features[key];
    if (!f || !Number.isFinite(f.value) || !validMonth(f.period) || !https(f.source)
      || !validTime(f.publishedAt) || !validTime(f.knownAt) || f.publishedAt > f.knownAt
      || f.knownAt > e.release - 300000) return false;
    if (['nfpMean3', 'unemployment', 'wages'].includes(key) && f.period >= e.target) return false;
    if (['adp', 'ismManufacturing', 'ismServices', 'claims4w', 'consensus'].includes(key) && f.period !== e.target) return false;
    if (key.startsWith('ism') || key === 'unemployment') return f.value >= 0 && f.value <= 100;
    return key !== 'claims4w' || f.value >= 0;
  });
}
export function parseResearch(value: unknown): Research {
  const r = value as Research;
  const unique = (items: { id: string }[]) => new Set(items.map(i => i.id)).size === items.length;
  if (!r || r.version !== 1 || !Array.isArray(r.releases) || !Array.isArray(r.outcomes) || !Array.isArray(r.events)
    || r.releases.length > 2000 || r.outcomes.length > 2000 || r.events.length > 600
    || !r.releases.every(validFirstRelease) || !r.outcomes.every(validOutcome) || !r.events.every(validResearchEvent)
    || !unique(r.releases) || !unique(r.outcomes) || !unique(r.events)
    || new Set(r.events.map(e => e.target)).size !== r.events.length
    || new Set(r.events.map(e => e.release)).size !== r.events.length) throw new Error('Dataset riset tidak valid: periksa satuan, periode, sumber, duplikasi, dan timestamp sebelum rilis.');
  return { version: 1, releases: r.releases, outcomes: r.outcomes, events: r.events };
}
export function readResearch(raw: string | null): Research { return raw ? parseResearch(JSON.parse(raw)) : emptyResearch(); }

export function appendFirstRelease(research: Research, input: Omit<FirstRelease, 'id' | 'recordedAt'>, now: number): Research {
  const row = { ...input, id: `nfp-${input.period}-${now}`, recordedAt: now };
  if (!validFirstRelease(row)) throw new Error('Isi angka rilis pertama, bulan target, waktu rilis yang sudah lewat, dan URL laporan BLS resmi.');
  return parseResearch({ ...research, releases: [...research.releases, row] });
}

export function modelDataset(releases: readonly FirstRelease[], cutoff: number) {
  const rows = new Map<string, { period: string; value: number }>();
  if (NFP_DATASET.capturedAt <= cutoff) NFP_DATASET.rows.forEach(r => rows.set(r.period, { ...r }));
  const known = releases.filter(r => r.recordedAt <= cutoff && r.publishedAt <= cutoff).sort((a,b) => a.recordedAt-b.recordedAt);
  known.forEach(r => rows.set(r.period, { period: r.period, value: r.value }));
  return { rows: [...rows.values()].sort((a,b) => a.period.localeCompare(b.period)),
    version: `${NFP_DATASET.version}${known.length ? `+manual-${known.length}-${known[known.length-1].recordedAt}` : ''}` };
}

export function mergeResearch(current: Research, incoming: unknown, now: number): Research {
  const next = parseResearch(incoming);
  // Preserve the real local observation time. Imported historical timestamps belong to retrospective research only.
  if (next.events.some(e => e.capturedAt > now) || next.releases.some(r => r.recordedAt > now)
    || next.outcomes.some(r => r.recordedAt > now)) throw new Error('File mengandung waktu di masa depan.');
  const merge = <T extends { id: string }>(a: T[], b: T[]): T[] => {
    const map = new Map(a.map(x => [x.id, x]));
    for (const row of b) {
      const old = map.get(row.id);
      if (old && JSON.stringify(old) !== JSON.stringify(row)) throw new Error('ID sudah ada dengan isi berbeda. Gunakan versi baru; catatan lama tidak ditimpa.');
      map.set(row.id, row);
    }
    return [...map.values()];
  };
  const result = parseResearch({ version: 1, releases: merge(current.releases, next.releases.map(r => ({...r,
    id: `${r.id}-import-${now}`, recordedAt: now }))), outcomes: merge(current.outcomes, next.outcomes), events: merge(current.events, next.events) });
  if (JSON.stringify(result).length > 1500000) throw new Error('Dataset terlalu besar untuk cadangan. Maksimal 1,5 MB.');
  return result;
}
export function quoteResult(outcome: Outcome) {
  return { long: outcome.exit.bid - outcome.entry.ask - outcome.cost,
    short: outcome.entry.bid - outcome.exit.ask - outcome.cost,
    midChange: ((outcome.exit.bid + outcome.exit.ask) - (outcome.entry.bid + outcome.entry.ask)) / 2 };
}

export function evaluateJournal(history: Snapshot[], research: Research, broker: Broker) {
  // One latest pre-entry snapshot per release, not one score per saved note.
  const latest = new Map<number, Snapshot>();
  for (const s of history) if (s.nfpForecast && s.createdAt <= s.plan.release - 300000
    && s.createdAt > (latest.get(s.plan.release)?.createdAt ?? 0)) latest.set(s.plan.release, s);
  return [...latest.values()].sort((a,b) => b.plan.release-a.plan.release).map(s => {
    const actual = research.releases.filter(r => r.period === s.plan.targetMonth && r.publishedAt === s.plan.release)
      .sort((a,b) => b.recordedAt-a.recordedAt)[0];
    const outcomes = research.outcomes.filter(o => o.release === s.plan.release && o.broker === broker);
    return { snapshot: s, actual, error: actual ? s.nfpForecast!.estimate - actual.value : null,
      consensusError: actual ? s.plan.forecast - actual.value : null,
      outcomes: outcomes.map(o => ({ ...o, result: quoteResult(o) })) };
  });
}
