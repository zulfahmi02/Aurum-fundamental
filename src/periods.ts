const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5));
export function validMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH.test(value) && Number(value.slice(0, 4)) >= 1900;
}
export function validTargetMonth(month: unknown, release: number): month is string {
  return validMonth(month) && Number.isFinite(release) && release > 0 && release <= 8640000000000000
    && month < new Date(release).toISOString().slice(0, 7);
}
export function validWeek(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    && new Date(time).getUTCDay() === 6;
}
export function referenceSaturday(month: string): string {
  if (!validMonth(month)) throw new Error('Bulan target tidak valid.');
  const time = new Date(`${month}-12T00:00:00Z`);
  time.setUTCDate(time.getUTCDate() + (6 - time.getUTCDay()));
  return time.toISOString().slice(0, 10);
}
export function knowledgeCutoff(release: number, now: number): number {
  return Math.min(now, release - 5 * 60000);
}
