// Current BLS data for descriptive live context, never a first-release training dataset.
export const MACRO_URL = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
const definitions = [
  { id: 'CES0000000001', label: 'Pertumbuhan payroll', mode: 'diff', unit: 'ribu pekerjaan' },
  { id: 'LNS14000000', label: 'Pengangguran', mode: 'level', unit: '%' },
  { id: 'CES0500000003', label: 'Upah per jam m/m', mode: 'pct', unit: '%' },
  { id: 'CUSR0000SA0', label: 'CPI headline m/m', mode: 'pct', unit: '%' },
  { id: 'CUSR0000SA0L1E', label: 'CPI tanpa makanan/energi m/m', mode: 'pct', unit: '%' },
  { id: 'WPSFD4', label: 'PPI headline m/m', mode: 'pct', unit: '%' },
  { id: 'WPSFD49104', label: 'PPI tanpa makanan/energi m/m', mode: 'pct', unit: '%' },
  { id: 'WPSFD41', label: 'PPI final demand barang m/m', mode: 'pct', unit: '%' },
  { id: 'WPSFD42', label: 'PPI final demand jasa m/m', mode: 'pct', unit: '%' },
] as const;
export type Macro = { fetchedAt: number; observations: { id: string; label: string; period: string; value: number; unit: string }[]; missing: string[] };
// Old six-series caches have neither a core PPI observation nor an explicit
// missing message. Upgrade once; a provider genuinely missing it keeps backoff.
export const needsCorePpi = (m: Macro) => !m.observations.some(o => o.id === 'WPSFD49104')
  && !m.missing.some(message => message.startsWith('PPI tanpa makanan/energi m/m:'));
export const needsMacroUpgrade = (m: Macro) => definitions.some(d => !m.observations.some(o => o.id === d.id) && !m.missing.some(message => message.startsWith(`${d.label}:`)));
const month = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5));
export function parseMacro(value: unknown, fetchedAt: number): Macro {
  const body = value as { status?: string; Results?: { series?: { seriesID: string; data: { year: string; period: string; value: string }[] }[] } };
  if (!body || body.status !== 'REQUEST_SUCCEEDED' || !Array.isArray(body.Results?.series) || !Number.isSafeInteger(fetchedAt) || fetchedAt <= 0) throw new Error('Data BLS belum tersedia.');
  const series = body.Results.series;
  const observations: Macro['observations'] = [], missing: string[] = [];
  for (const def of definitions) {
    const raw = series.find(s => s.seriesID === def.id)?.data;
    const rows = Array.isArray(raw) ? raw.filter(r => r && /^\d{4}$/.test(r.year) && /^M(0[1-9]|1[0-2])$/.test(r.period)
      && typeof r.value === 'string' && /^-?\d+(?:\.\d+)?$/.test(r.value.trim()))
      .map(r => ({ period: `${r.year}-${r.period.slice(1)}`, value: Number(r.value) }))
      .filter(r => r.period <= new Date(fetchedAt).toISOString().slice(0, 7)).sort((a, b) => b.period.localeCompare(a.period)) : [];
    const first = rows[0], previous = rows[1];
    if (!first || (def.mode !== 'level' && (!previous || month(first.period) - month(previous.period) !== 1 || (def.mode === 'pct' && previous.value === 0)))) {
      missing.push(`${def.label}: data BLS tidak lengkap.`); continue;
    }
    const result = def.mode === 'level' ? first.value : def.mode === 'diff' ? first.value - previous.value : (first.value / previous.value - 1) * 100;
    if (!Number.isFinite(result)) { missing.push(`${def.label}: nilai tidak valid.`); continue; }
    observations.push({ id: def.id, label: def.label, period: first.period, value: Math.round(result * 100) / 100, unit: def.unit });
  }
  if (!observations.length) throw new Error('Semua seri BLS belum tersedia.');
  return { fetchedAt, observations, missing };
}
export function readMacro(value: unknown): Macro {
  const m = value as Macro;
  if (!m || !Number.isSafeInteger(m.fetchedAt) || m.fetchedAt <= 0 || !Array.isArray(m.observations) || m.observations.length > definitions.length
    || !Array.isArray(m.missing) || m.missing.length > definitions.length || !m.missing.every(s => typeof s === 'string' && s.length < 500)
    || new Set(m.observations.map(o => o?.id)).size !== m.observations.length
    || !m.observations.every(o => o && definitions.some(d => d.id === o.id && d.label === o.label && d.unit === o.unit)
      && /^\d{4}-(0[1-9]|1[0-2])$/.test(o.period) && Number.isFinite(o.value))) throw new Error('Cache BLS otomatis tidak valid.');
  return m;
}
export async function fetchMacro(): Promise<Macro> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(MACRO_URL, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seriesid: definitions.map(d => d.id) }) });
    if (!response.ok) throw new Error(`BLS HTTP ${response.status}`);
    return parseMacro(await response.json(), Date.now());
  } finally { clearTimeout(timer); }
}
