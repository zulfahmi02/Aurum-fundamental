import { ClaimsData, fetchClaimsData } from './claims';
export type Observation = { year: string; period: string; value: string };
export type Point = { period: string; value: number };
export type Payroll = { period: string; change: number };

// BLS series IDs. All seasonally adjusted. v1 API: no key, ~25 requests/day per IP, ~3 years of data.
export const SERIES = {
  payroll: 'CES0000000001',       // total nonfarm employment, thousands
  unemployment: 'LNS14000000',    // unemployment rate, percent
  jolts: 'JTS000000000000000JOL', // job openings, total nonfarm, thousands
  cpi: 'CUSR0000SA0',             // CPI-U all items, index 1982-84=100
  wages: 'CES0500000003',        // average hourly earnings, all private employees, dollars
  ppi: 'WPSFD4',                  // PPI final demand, index Nov 2009=100
} as const;
export type SeriesKey = keyof typeof SERIES;

export type Fundamentals = {
  wages?: Point[];       // month-over-month growth in average hourly earnings, percent; absent in legacy cache
  claims?: ClaimsData;    // national seasonally adjusted claims, number, via FRED
  payroll: Payroll[];     // monthly change, thousands
  unemployment: Point[];  // level, percent
  jolts: Point[];         // level, thousands
  cpi: Point[];           // month-over-month, percent
  ppi: Point[];           // month-over-month, percent
};

const KEEP = 6;
const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5));

// Monthly rows only (drops annual M13), ascending by YYYY-MM, non-numeric values dropped.
export function monthly(observations: Observation[]): Point[] {
  return observations.filter(o => o && typeof o.year === 'string' && /^\d{4}$/.test(o.year)
    && /^M(0[1-9]|1[0-2])$/.test(o.period) && typeof o.value === 'string'
    && /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(o.value.trim()))
    .map(o => ({ period: `${o.year}-${o.period.slice(1)}`, value: Number(o.value.replaceAll(',', '')) }))
    .filter(o => Number.isFinite(o.value)).sort((a, b) => a.period.localeCompare(b.period));
}

// Change versus the previous calendar month; a gap in the series yields no row for that month.
export function changes(points: Point[], mode: 'diff' | 'pct'): Point[] {
  return points.slice(1).flatMap((o, i) => {
    const previous = points[i];
    if (monthIndex(o.period) - monthIndex(previous.period) !== 1) return [];
    if (mode === 'diff') return [{ period: o.period, value: o.value - previous.value }];
    if (previous.value === 0) return [];
    return [{ period: o.period, value: Math.round((o.value / previous.value - 1) * 10000) / 100 }];
  }).reverse().slice(0, KEEP);
}

export function levels(points: Point[]): Point[] {
  return points.slice().reverse().slice(0, KEEP);
}

export function payrollChanges(observations: Observation[]): Payroll[] {
  return changes(monthly(observations), 'diff').map(p => ({ period: p.period, change: p.value }));
}

// One POST for every series: v1 allows up to 25 series per request and the daily quota is small.
export async function fetchBls(ids: readonly string[]): Promise<Record<string, Observation[]>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seriesid: ids }), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`BLS mengembalikan HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS belum dapat menyediakan data. Coba kembali nanti.');
    const series = payload.Results?.series;
    if (!Array.isArray(series)) throw new Error('Format data BLS tidak dikenali.');
    const out: Record<string, Observation[]> = {};
    for (const s of series) if (typeof s?.seriesID === 'string' && Array.isArray(s.data)) out[s.seriesID] = s.data;
    return out;
  } finally { clearTimeout(timer); }
}

export async function fetchFundamentals(): Promise<Fundamentals> {
  const [blsResult, claimsResult] = await Promise.allSettled([fetchBls(Object.values(SERIES)), fetchClaimsData()]);
  if (blsResult.status === 'rejected') throw blsResult.reason;
  const raw = blsResult.value;
  const get = (key: SeriesKey) => monthly(raw[SERIES[key]] ?? []);
  const result: Fundamentals = {
    wages: changes(get('wages'), 'pct'),
    claims: claimsResult.status === 'fulfilled' ? claimsResult.value : undefined,
    payroll: changes(get('payroll'), 'diff').map(p => ({ period: p.period, change: p.value })),
    unemployment: levels(get('unemployment')),
    jolts: levels(get('jolts')),
    cpi: changes(get('cpi'), 'pct'),
    ppi: changes(get('ppi'), 'pct'),
  };
  if (!result.payroll.length) throw new Error('Data bulanan NFP dari BLS belum tersedia.');
  return result;
}

export function parseWib(input: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input)) return null;
  const stamp = Date.parse(input.replace(' ', 'T') + ':00+07:00');
  if (!Number.isFinite(stamp)) return null;
  const roundtrip = new Date(stamp + 7 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
  return roundtrip === input ? stamp : null;
}
export function phase(release: number, now: number): string {
  const left = release - now;
  if (left <= 0) return 'News sudah dirilis';
  if (left <= 5 * 60000) return 'Jendela entry · T−5 menit';
  if (left <= 5 * 3600000) return 'Jendela persiapan · T−5 jam';
  return 'Menunggu jendela persiapan';
}
