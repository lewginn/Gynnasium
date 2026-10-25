import type { LoggingType } from './types'

/** 90 → "1:30", 3725 → "1:02:05". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** 150 → "2:30 rest" style label without the word; whole minutes as "2 min". */
export function formatRest(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60} min` : formatClock(sec)
}

/** A workout's length: "<1 min", "52 min", "1h 05m". */
export function formatDuration(ms: number): string {
  if (ms < 60000) return '<1 min'
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
}

export function formatDay(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const days = daysAgo(ts, now)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined })
}

/** Calendar days from `ts` to `now` in local time (0 = same day), whatever the clock change in between. */
function daysAgo(ts: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(ts)) / 86400000)
}

function startOfDay(ts: number) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// When a workout happened. `locale` defaults to the device's, so 12/24-hour follows the phone.
type Locale = string | string[] | undefined

/** "18:30", or "6:30 PM" on a 12-hour phone. The 24-hour clock is zero-padded ("09:05"), as on iOS. */
export function formatTime(ts: number, locale?: Locale): string {
  const h24 = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12 === false
  return new Intl.DateTimeFormat(locale, { hour: h24 ? '2-digit' : 'numeric', minute: '2-digit' }).format(ts)
}

/**
 * A workout's start, short, for lists: "Today, 18:30", "Yesterday, 18:30", "Tue, 18:30" within the week,
 * then "Tue 21 Oct, 18:30", with the year outside the current one.
 */
export function formatWhen(ts: number, now = Date.now(), locale?: Locale): string {
  return `${formatWhenDay(ts, now, locale)}, ${formatTime(ts, locale)}`
}

function formatWhenDay(ts: number, now: number, locale: Locale): string {
  const days = daysAgo(ts, now)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days > 1 && days < 7) return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(ts)
  const year = new Date(ts).getFullYear() !== new Date(now).getFullYear() ? 'numeric' : undefined
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year }).format(ts)
}

/** A workout's start in full, for its own page: "Tuesday 21 October 2026, 18:30". */
export function formatFullWhen(ts: number, locale?: Locale): string {
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ts)
  return `${date}, ${formatTime(ts, locale)}`
}

export function repRange(min: number, max: number): string {
  return min === max ? `${min}` : `${min}–${max}`
}

/** A plan target: "3 × 8–12", or "3 × 30–60s" for timed exercises. */
export function formatTarget(sets: number, min: number, max: number, logging: LoggingType): string {
  return `${sets} × ${repRange(min, max)}${logging === 'time' ? 's' : ''}`
}
