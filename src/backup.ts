import { ManualObservation, readManual } from './manual';
import { Cache, Plan, Snapshot, readHistory, validCache, validPlan } from './review';
import { Research, parseResearch } from './research';
import { PpiState, parsePpi } from './ppiModel';

export type Backup = { version: 1; plan: Plan | null; cache: Cache | null; history: Snapshot[]; manual?: ManualObservation[]; research?: Research; ppi?: PpiState };
export function parseBackup(value: unknown): Backup {
  if (!value || typeof value !== 'object') throw new Error('Format cadangan tidak dikenali.');
  const b = value as Backup;
  if (b.version !== 1 || (b.plan !== null && !validPlan(b.plan)) || (b.cache !== null && !validCache(b.cache))
    || !Array.isArray(b.history)) throw new Error('Isi cadangan tidak valid.');
  return { version: 1, plan: b.plan, cache: b.cache, history: readHistory(JSON.stringify(b.history)), ...(b.manual === undefined ? {} : { manual: readManual(JSON.stringify(b.manual)) }), ...(b.research === undefined ? {} : { research: parseResearch(b.research) }), ...(b.ppi === undefined ? {} : { ppi: parsePpi(b.ppi) }) };
}
export function planDate(plan: Plan): string {
  return new Date(plan.release + 7 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
}
