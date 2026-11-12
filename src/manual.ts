import { validMonth } from './periods';
export const MANUAL_KEY = 'aurum-manual-indicators-v1';
export const MANUAL_TYPES = {
  adp: { label: 'ADP employment bulanan', unit: 'ribu pekerjaan', url: 'https://adpemploymentreport.com/' },
  ismManufacturing: { label: 'ISM Manufacturing Employment', unit: 'poin indeks', url: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/' },
  ismServices: { label: 'ISM Services Employment', unit: 'poin indeks', url: 'https://www.ismworld.org/supply-management-news-and-reports/reports/ism-pmi-reports/' },
} as const;
export type ManualKind = keyof typeof MANUAL_TYPES;
export type ManualObservation = {
  id: string; kind: ManualKind; period: string; value: number;
  publishedAt: number; recordedAt: number; sourceUrl: string;
};
export type ManualInput = Omit<ManualObservation, 'id' | 'recordedAt'>;
const timeValid = (time: number) => Number.isFinite(time) && time > 0 && time < 8640000000000000;
export function validSource(url: string, kind: ManualKind): boolean {
  try {
    const parsed = new URL(url);
    const domains = kind === 'adp' ? ['adpemploymentreport.com', 'adp.com', 'adpresearch.com'] : ['ismworld.org'];
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port
      && domains.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
  } catch { return false; }
}
export function validManual(value: unknown): value is ManualObservation {
  if (!value || typeof value !== 'object') return false;
  const p = value as ManualObservation;
  return typeof p.id === 'string' && !!p.id && Object.hasOwn(MANUAL_TYPES, p.kind) && validMonth(p.period)
    && typeof p.value === 'number' && Number.isFinite(p.value)
    && (p.kind === 'adp' || (p.value >= 0 && p.value <= 100))
    && timeValid(p.publishedAt) && timeValid(p.recordedAt) && p.publishedAt <= p.recordedAt
    && p.publishedAt >= Date.parse(p.period + '-01T00:00:00Z')
    && typeof p.sourceUrl === 'string' && validSource(p.sourceUrl, p.kind);
}
export function readManual(raw: string | null): ManualObservation[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(validManual) || new Set(value.map(p => p.id)).size !== value.length)
    throw new Error('Data ADP/ISM tersimpan tidak valid.');
  return value;
}
export function appendManual(records: ManualObservation[], input: ManualInput, now: number): ManualObservation[] {
  const next = { ...input, recordedAt: now, id: `${input.kind}:${input.period}:${now}:${records.length}` };
  if (!validManual(next)) throw new Error('Periksa bulan, nilai, waktu rilis, dan tautan laporan resmi. Rilis tidak boleh di masa depan; ISM harus 0–100.');
  if (records.some(r => r.id === next.id)) throw new Error('Catatan duplikat. Coba simpan kembali.');
  return [next, ...records];
}
export function selectManual(records: ManualObservation[], kind: ManualKind, period: string, cutoff: number): ManualObservation | undefined {
  // recordedAt is the first time this device knew this version. A backdated release does not backdate knowledge.
  return records.filter(r => r.kind === kind && r.period === period && r.publishedAt <= cutoff && r.recordedAt <= cutoff)
    .sort((a, b) => b.recordedAt - a.recordedAt)[0];
}
export function manualSummary(records: ManualObservation[], target: string | undefined, cutoff: number) {
  const evidence: { key: ManualKind; label: string; text: string; url: string }[] = [];
  const gaps: string[] = [];
  for (const kind of Object.keys(MANUAL_TYPES) as ManualKind[]) {
    const meta = MANUAL_TYPES[kind];
    if (!target) { gaps.push(`${meta.label}: isi bulan target NFP agar periode bisa dipilih.`); continue; }
    const row = selectManual(records, kind, target, cutoff);
    if (!row) {
      const later = records.some(r => r.kind === kind && r.period === target);
      gaps.push(`${meta.label} ${target}: ${later ? 'versi yang dicatat/dirilis sebelum batas analisis belum tersedia' : 'belum diisi'}.`);
      continue;
    }
    const formatted = row.value.toLocaleString('id-ID', { maximumFractionDigits: 3 });
    const explanation = kind === 'adp'
      ? 'ADP mengukur pekerjaan swasta secara independen; angkanya bukan estimasi NFP total.'
      : `${row.value > 50 ? 'Di atas 50 menunjukkan ekspansi' : row.value < 50 ? 'Di bawah 50 menunjukkan kontraksi' : 'Tepat 50 menunjukkan tidak ada perubahan'} ketenagakerjaan pada survei ini. Ini komponen employment, bukan headline PMI atau persentase pertumbuhan pekerjaan.`;
    const time = (t: number) => new Date(t).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
    evidence.push({ key: kind, label: `${meta.label} · input manual`, url: row.sourceUrl,
      text: `${target}: ${formatted} ${meta.unit}. ${explanation} Rilis menurut input: ${time(row.publishedAt)}. Dicatat: ${time(row.recordedAt)}. Angka dan waktu rilis belum diverifikasi otomatis.` });
  }
  return { evidence, gaps };
}
