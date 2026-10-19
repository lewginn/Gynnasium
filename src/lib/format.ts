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
  const days = Math.floor((startOfDay(now) - startOfDay(ts)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined })
}

function startOfDay(ts: number) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function repRange(min: number, max: number): string {
  return min === max ? `${min}` : `${min}–${max}`
}

/** A plan target: "3 × 8–12", or "3 × 30–60s" for timed exercises. */
export function formatTarget(sets: number, min: number, max: number, logging: LoggingType): string {
  return `${sets} × ${repRange(min, max)}${logging === 'time' ? 's' : ''}`
}
