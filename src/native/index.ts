// The iOS app (Capacitor) runs this same code in a WebView. This is the only place that knows about it:
// everything else asks `isNative` or calls these helpers, which do nothing on the web.
// Plugins are imported on demand, so the web build never loads them.
import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()

/**
 * Where the web app lives. On the web that's this page; in the app the page is served from
 * capacitor://localhost, so the coach API and email links use the deployed site (VITE_WEB_URL) instead.
 */
export function webOrigin(): string {
  return isNative ? (import.meta.env.VITE_WEB_URL ?? '').replace(/\/$/, '') : window.location.origin
}

const haptics = () => import('@capacitor/haptics')

export function nativeTap() {
  void haptics()
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {})
}

export function nativeRestOver() {
  void haptics()
    .then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Warning }))
    .catch(() => {})
}

export async function keepAwake(on: boolean) {
  const { KeepAwake } = await import('@capacitor-community/keep-awake')
  await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep())
}

// One pending "rest over" notification at a time, always under this id.
const REST_NOTIFICATION_ID = 1
// Calls run one after another, so a quick start-then-skip can't leave the first notification scheduled.
let restQueue = Promise.resolve()

/**
 * Schedules a "Rest over" notification for `endAt`, replacing any earlier one, or cancels it when `endAt` is null.
 * iOS only shows it when the app is in the background or the phone is locked (see capacitor.config.ts).
 */
export function scheduleRestOver(endAt: number | null, label: string): Promise<void> {
  restQueue = restQueue.then(() => updateRestOver(endAt, label)).catch(() => {})
  return restQueue
}

async function updateRestOver(endAt: number | null, label: string) {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIFICATION_ID }] })
  if (!endAt || endAt <= Date.now()) return
  // The first time, iOS asks whether Gynnasium may send notifications.
  const { display } = await LocalNotifications.checkPermissions()
  const allowed = display === 'granted' || (display !== 'denied' && (await LocalNotifications.requestPermissions()).display === 'granted')
  if (!allowed) return
  await LocalNotifications.schedule({
    notifications: [{ id: REST_NOTIFICATION_ID, title: 'Rest over', body: label, schedule: { at: new Date(endAt) } }],
  })
}
