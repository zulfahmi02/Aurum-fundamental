// Keep individual storage rows small as full indicator snapshots grow.
// 500k UTF-16 code units are at most 1.5 MB UTF-8, a conservative device cache cap.
// Server archives are unaffected; only the disposable device cache is shortened.
export function encodeAutomaticCache(value: { reports: unknown[]; [key: string]: unknown }): string {
  const cache = { ...value, reports: [...value.reports] };
  let encoded = JSON.stringify(cache);
  while (encoded.length > 500000 && cache.reports.length > 1) {
    cache.reports.pop(); // Reports arrive newest first.
    encoded = JSON.stringify(cache);
  }
  if (encoded.length > 500000) throw new Error('Cache otomatis terlalu besar untuk disimpan; arsip server tetap tersedia.');
  return encoded;
}
