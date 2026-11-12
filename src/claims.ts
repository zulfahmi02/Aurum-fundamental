import { validWeek } from './periods';
export type ClaimsId = 'ICSA' | 'CCSA';
export type WeeklyPoint = { period: string; value: number };
export type ClaimsSeries = {
  id: ClaimsId;
  status: 'available' | 'unavailable';
  fetchedAt: number;
  points: WeeklyPoint[];
  error?: string;
};
export type ClaimsData = { initial: ClaimsSeries; continued: ClaimsSeries };
export const claimsUrl = (id: ClaimsId) => `https://fred.stlouisfed.org/series/${id}`;

// FRED graph download: date is the observation week, not the publication date.
export function parseClaimsCsv(csv: string, id: ClaimsId): WeeklyPoint[] {
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (!['observation_date,' + id, 'DATE,' + id].includes(lines[0])) throw new Error('Format CSV claims berubah atau respons bukan data.');
  const rows = new Map<string, number>();
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split(',');
    if (cells.length !== 2 || !validWeek(cells[0])) throw new Error('Tanggal atau kolom claims tidak valid.');
    if (!cells[1] || cells[1] === '.') continue;
    if (!/^\d+(?:\.0+)?$/.test(cells[1])) throw new Error('Nilai claims tidak valid.');
    const value = Number(cells[1]);
    if (!Number.isSafeInteger(value)) throw new Error('Nilai claims di luar rentang.');
    if (rows.has(cells[0])) throw new Error('Tanggal claims duplikat.');
    rows.set(cells[0], value);
  }
  const points = [...rows].map(([period, value]) => ({ period, value })).sort((a, b) => b.period.localeCompare(a.period)).slice(0, 52);
  if (!points.length) throw new Error('Data claims kosong.');
  return points;
}
export function fourWeekAverage(points: WeeklyPoint[]): number | null {
  if (points.length < 4) return null;
  const rows = points.slice(0, 4);
  if (!rows.every((p, i) => i === 0 || Date.parse(rows[i - 1].period) - Date.parse(p.period) === 7 * 86400000)) return null;
  return rows.reduce((sum, p) => sum + p.value, 0) / 4;
}
async function fetchClaims(id: ClaimsId): Promise<ClaimsSeries> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const points = parseClaimsCsv(await response.text(), id);
    const fetchedAt = Date.now();
    if (points[0].period > new Date(fetchedAt).toISOString().slice(0, 10)) throw new Error('Minggu claims berada di masa depan. Periksa jam perangkat.');
    return { id, status: 'available', fetchedAt, points };
  } catch (error) {
    return { id, status: 'unavailable', fetchedAt: Date.now(), points: [], error: error instanceof Error ? error.message : 'Gagal mengambil claims.' };
  } finally { clearTimeout(timer); }
}
export async function fetchClaimsData(): Promise<ClaimsData> {
  const [initial, continued] = await Promise.all([fetchClaims('ICSA'), fetchClaims('CCSA')]);
  return { initial, continued };
}
export function validClaimsSeries(value: unknown, id: ClaimsId): value is ClaimsSeries {
  if (!value || typeof value !== 'object') return false;
  const s = value as ClaimsSeries;
  return s.id === id && ['available', 'unavailable'].includes(s.status)
    && Number.isFinite(s.fetchedAt) && s.fetchedAt > 0 && (s.error === undefined || typeof s.error === 'string')
    && Array.isArray(s.points) && s.points.length <= 52
    && (s.status === 'available' ? s.points.length > 0 : s.points.length === 0)
    && s.points.every((p, i) => p && validWeek(p.period) && Number.isSafeInteger(p.value) && p.value >= 0
      && (i === 0 || s.points[i - 1].period > p.period));
}
