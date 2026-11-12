import { MANUAL_KEY } from './manual';
import { Backup, parseBackup, planDate } from './backup';
import { CACHE_KEY, HISTORY_KEY } from './review';
import { RESEARCH_KEY, emptyResearch } from './research';
import { PPI_KEY, emptyPpi } from './ppiModel';
export const PLAN_KEY = 'aurum-planner-v1';
export const RESTORE_KEY = 'aurum-restore-pending-v1';
type Store = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  multiSet(entries: [string, string][]): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};
async function apply(store: Store, backup: Backup) {
  await store.multiSet([
    [PLAN_KEY, JSON.stringify(backup.plan ? { date: planDate(backup.plan), saved: backup.plan } : null)],
    [CACHE_KEY, JSON.stringify(backup.cache)],
    [HISTORY_KEY, JSON.stringify(backup.history)],
    [MANUAL_KEY, JSON.stringify(backup.manual ?? [])],
    [RESEARCH_KEY, JSON.stringify(backup.research ?? emptyResearch())],
    [PPI_KEY, JSON.stringify(backup.ppi ?? emptyPpi())],
  ]);
  await store.removeItem(RESTORE_KEY);
}
// Recovery journal survives a process exit or partial storage failure during restore.
export async function restoreLocal(store: Store, value: Backup): Promise<void> {
  const backup = parseBackup(value);
  await store.setItem(RESTORE_KEY, JSON.stringify(backup));
  await apply(store, backup);
}
export async function recoverRestore(store: Store): Promise<void> {
  const pending = await store.getItem(RESTORE_KEY);
  if (pending) await apply(store, parseBackup(JSON.parse(pending)));
}
