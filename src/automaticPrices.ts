import type { AutoReport, NewsEvent } from './automatic.ts';
import type { Bias } from './automaticBias.ts';

// Shared by Expo and the scheduled price worker. No native dependencies or private keys.
// Indicative public spot quote: NOT the HFM/Exness account server and not an execution price.
export const PRICE_URL = 'https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD';
// One fixed feed, so entry and exit are never compared across different spread profiles.
export const PRICE_PLATFORM = 'SwissquoteLtd', PRICE_PROFILE = 'premium';
export type PriceLeg = 'entry' | 'exit';
export type Quote = { at: number; bid: number; ask: number; server: string };
export type PriceTick = Quote & {
  version: 1; id: string; eventId: string; release: number; leg: PriceLeg; target: number; capturedAt: number;
  platform: typeof PRICE_PLATFORM; profile: typeof PRICE_PROFILE; source: typeof PRICE_URL;
};
export type PriceEvaluation = {
  eventId: string; release: number; entry: PriceTick; exit: PriceTick;
  reportId: string | null; bias: Bias | null;
  midChange: number; buy: number; sell: number;
  // Only for BUY/SELL: hypothetical USD/oz after this feed's spread, and whether mid moved the same way.
  result: number | null; aligned: boolean | null;
};
// The cron fires on the minute. Allow small clock skew before the target and a
// bounded delay after it; the actual quote time is always stored, never hidden.
const EARLY = 5000, LATE = 30000, STALE = 15000, SKEW = 2000;
const time = (t: unknown): t is number => typeof t === 'number' && Number.isSafeInteger(t) && t > 0;
const round = (n: number) => Math.round(n * 1000) / 1000;
export const legTarget = (release: number, leg: PriceLeg) => leg === 'entry' ? release - 5 * 60000 : release + 60000;
const inWindow = (target: number, now: number) => now >= target - EARLY && now <= target + LATE;
const validQuote = (q: Quote) => time(q.at) && [q.bid, q.ask].every(n => typeof n === 'number' && Number.isFinite(n))
  && q.bid > 100 && q.ask < 100000 && q.bid <= q.ask && q.ask - q.bid <= 50
  && typeof q.server === 'string' && !!q.server && q.server.length <= 50;

export function parseQuote(value: unknown, now: number): Quote {
  if (!time(now) || !Array.isArray(value) || value.length > 50) throw new Error('Format harga tidak dikenali.');
  const row = value.find(r => r?.topo?.platform === PRICE_PLATFORM);
  const price = Array.isArray(row?.spreadProfilePrices)
    ? row.spreadProfilePrices.find((p: { spreadProfile?: unknown } | null) => p?.spreadProfile === PRICE_PROFILE) : null;
  if (!price) throw new Error('Feed harga yang ditetapkan tidak tersedia.');
  const quote: Quote = { at: row.ts, bid: price.bid, ask: price.ask, server: row.topo.server };
  if (!validQuote(quote)) throw new Error('Harga tidak valid.');
  // A closed market or frozen feed must not be stored as the price at the target time.
  if (quote.at > now + SKEW || now - quote.at > STALE) throw new Error('Harga sudah basi atau bertanggal masa depan.');
  return quote;
}
export function dueLegs(events: NewsEvent[], now: number): { event: NewsEvent; leg: PriceLeg }[] {
  if (!time(now)) return [];
  return events.flatMap(event => (['entry', 'exit'] as const).filter(leg => inWindow(legTarget(event.release, leg), now)).map(leg => ({ event, leg })));
}
export function readPriceTick(value: unknown): PriceTick {
  const t = value as PriceTick;
  const match = typeof t?.eventId === 'string' ? t.eventId.match(/^(NFP|CPI|PPI|FOMC)-(\d+)$/) : null;
  if (!t || t.version !== 1 || !match || !time(t.release) || Number(match[2]) !== t.release || !['entry', 'exit'].includes(t.leg)
    || t.id !== `${t.eventId}-${t.leg}` || t.target !== legTarget(t.release, t.leg) || !time(t.capturedAt) || !inWindow(t.target, t.capturedAt)
    || !validQuote(t) || t.at > t.capturedAt + SKEW || t.capturedAt - t.at > STALE
    || t.platform !== PRICE_PLATFORM || t.profile !== PRICE_PROFILE || t.source !== PRICE_URL) throw new Error('Catatan harga tidak valid.');
  return t;
}
export function makePriceTick(event: NewsEvent, leg: PriceLeg, quote: Quote, capturedAt: number): PriceTick {
  return readPriceTick({ version: 1, id: `${event.id}-${leg}`, eventId: event.id, release: event.release, leg, target: legTarget(event.release, leg),
    at: quote.at, capturedAt, bid: quote.bid, ask: quote.ask, server: quote.server, platform: PRICE_PLATFORM, profile: PRICE_PROFILE, source: PRICE_URL });
}
export async function fetchQuote(): Promise<Quote> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(PRICE_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Harga HTTP ${response.status}`);
    const raw = await response.text();
    if (raw.length > 100000) throw new Error('Respons harga terlalu besar.');
    return parseQuote(JSON.parse(raw), Date.now());
  } finally { clearTimeout(timer); }
}

// Pairs each event's two recorded quotes with the last backend report published before
// the entry cutoff. Events missing a leg are skipped: a missed live quote is never backfilled.
export function evaluatePrices(reports: AutoReport[], ticks: PriceTick[]): PriceEvaluation[] {
  const legs = new Map<string, Partial<Record<PriceLeg, PriceTick>>>();
  for (const t of ticks) legs.set(t.eventId, { ...legs.get(t.eventId), [t.leg]: t });
  return [...legs.entries()].flatMap(([eventId, { entry, exit }]) => {
    if (!entry || !exit || entry.server !== exit.server) return [];
    const report = reports.filter(r => r.event.id === eventId && r.origin === 'server' && r.generatedAt <= entry.target)
      .sort((a, b) => b.generatedAt - a.generatedAt)[0];
    const bias = report?.bias ?? null;
    const midChange = round((exit.bid + exit.ask) / 2 - (entry.bid + entry.ask) / 2);
    const buy = round(exit.bid - entry.ask), sell = round(entry.bid - exit.ask);
    const directional = bias === 'BUY' || bias === 'SELL';
    return [{ eventId, release: entry.release, entry, exit, reportId: report?.id ?? null, bias, midChange, buy, sell,
      result: directional ? (bias === 'BUY' ? buy : sell) : null,
      aligned: directional ? (bias === 'BUY' ? midChange > 0 : midChange < 0) : null }];
  }).sort((a, b) => b.release - a.release);
}
// Counts only, never a percentage: a handful of events is not an accuracy estimate.
export function summarizePrices(evaluations: PriceEvaluation[]) {
  const directional = evaluations.filter(e => e.result !== null);
  const total = (pick: (e: PriceEvaluation) => number) => round(directional.reduce((sum, e) => sum + pick(e), 0));
  return { events: evaluations.length, directional: directional.length, aligned: directional.filter(e => e.aligned).length,
    result: total(e => e.result!), alwaysBuy: total(e => e.buy), alwaysSell: total(e => e.sell) };
}
