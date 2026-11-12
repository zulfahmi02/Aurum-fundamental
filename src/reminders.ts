import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { reminderPlan } from './reminderPlan';

const PREFIX = 'aurum-nfp-';
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(action, action);
  queue = result.catch(() => {});
  return result;
}
async function cancelOwned(keepRelease?: number) {
  for (const r of await Notifications.getAllScheduledNotificationsAsync()) {
    if (r.identifier.startsWith(PREFIX) && (keepRelease === undefined || r.content.data?.release !== keepRelease))
      await Notifications.cancelScheduledNotificationAsync(r.identifier);
  }
}
export const cancelReminders = () => serial(() => cancelOwned());
export const reconcileReminders = (release?: number) => serial(async () => {
  await cancelOwned(release);
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.filter(r => r.identifier.startsWith(PREFIX)).length;
});
export const scheduleReminders = (release: number) => serial(async () => {
  const plan = reminderPlan(release, Date.now());
  if (!plan.length) throw new Error('Seluruh waktu pengingat sudah lewat.');
  await Notifications.setNotificationChannelAsync('nfp', { name: 'Persiapan NFP', importance: AndroidImportance.HIGH });
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Izin notifikasi belum diberikan. Aktifkan melalui pengaturan Android.');
  await cancelOwned();
  try {
    for (const item of plan) await Notifications.scheduleNotificationAsync({
      identifier: `${PREFIX}${release}-${item.key}`,
      content: { title: item.title, body: item.body, sound: 'default', data: { release } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(item.at), channelId: 'nfp', delivery: 'bestEffort' },
    });
  } catch (error) { await cancelOwned(); throw error; }
  return plan.length;
});
