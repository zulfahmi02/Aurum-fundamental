export function reminderPlan(release: number, now: number) {
  if (!Number.isSafeInteger(release) || release <= 0 || !Number.isFinite(now)) return [];
  return [
    { key: 'prepare', at: release - 5 * 3600000, title: 'NFP: persiapan T−5 jam', body: 'Buka Aurum, perbarui data, dan periksa konsensus serta alasan estimasi.' },
    { key: 'review', at: release - 10 * 60000, title: 'NFP: periksa data sebelum cutoff', body: 'Perbarui data dan simpan catatan sebelum T−5 menit. Pengingat ini bukan sinyal entry.' },
    { key: 'cutoff', at: release - 5 * 60000, title: 'NFP: batas analisis T−5 menit', body: 'Batas perhitungan baru tercapai. Gunakan catatan yang telah tersimpan.' },
    { key: 'finish', at: release + 60000, title: 'NFP: T+1 menit', body: 'Jendela pengamatan selesai. Catat actual NFP dan evaluasi hasil broker.' },
  ].filter(r => r.at > now);
}

// Reminders for the automatic calendar. They only ask the user to open the app: the bias is
// produced by the backend later and cannot be included in a locally scheduled notification.
export const AUTO_REMINDER_PREFIX = 'aurum-auto-';
const wib = (t: number) => new Date(t + 7 * 3600000).toISOString().slice(11, 16).replace(':', '.');
export function autoReminderPlan(events: readonly { id: string; kind: string; release: number }[], now: number) {
  if (!Number.isFinite(now)) return [];
  return events.filter(e => Number.isSafeInteger(e.release) && e.release > 0).flatMap(e => [
    { id: `${AUTO_REMINDER_PREFIX}${e.id}-prepare`, at: e.release - 5 * 3600000, title: `${e.kind} hari ini pukul ${wib(e.release)} WIB`,
      body: 'Laporan T−5 jam tersedia di Aurum. Pengingat ini bukan sinyal entry.' },
    // Fifteen minutes, not ten: Android may delay a notification by a few minutes.
    { id: `${AUTO_REMINDER_PREFIX}${e.id}-check`, at: e.release - 15 * 60000, title: `${e.kind} 15 menit lagi`,
      body: `Laporan terakhir terbit sekitar ${wib(e.release - 10 * 60000)} WIB. Batas entry ${wib(e.release - 5 * 60000)} WIB. Buka Aurum untuk melihat bias; pengingat ini bukan sinyal.` },
  ]).filter(r => r.at > now).sort((a, b) => a.at - b.at);
}
