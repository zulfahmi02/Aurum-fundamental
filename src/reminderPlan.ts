export function reminderPlan(release: number, now: number) {
  if (!Number.isSafeInteger(release) || release <= 0 || !Number.isFinite(now)) return [];
  return [
    { key: 'prepare', at: release - 5 * 3600000, title: 'NFP: persiapan T−5 jam', body: 'Buka Aurum, perbarui data, dan periksa konsensus serta alasan estimasi.' },
    { key: 'review', at: release - 10 * 60000, title: 'NFP: periksa data sebelum cutoff', body: 'Perbarui data dan simpan catatan sebelum T−5 menit. Pengingat ini bukan sinyal entry.' },
    { key: 'cutoff', at: release - 5 * 60000, title: 'NFP: batas analisis T−5 menit', body: 'Batas perhitungan baru tercapai. Gunakan catatan yang telah tersimpan.' },
    { key: 'finish', at: release + 60000, title: 'NFP: T+1 menit', body: 'Jendela pengamatan selesai. Catat actual NFP dan evaluasi hasil broker.' },
  ].filter(r => r.at > now);
}
