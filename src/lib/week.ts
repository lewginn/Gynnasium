/** Weeks start on Monday, as on a training calendar. */
export function startOfWeek(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

function addDays(ts: number, days: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + days) // calendar days, so DST changes don't shift the boundary
  return d.getTime()
}

export interface WeekSummary {
  /** Monday to Sunday: whether you trained that day. */
  trained: boolean[]
  /** 0 = Monday. */
  todayIndex: number
  /** Workouts this week (two on one day count as two). */
  count: number
}

export function weekSummary(sessionStarts: number[], now: number): WeekSummary {
  const monday = startOfWeek(now)
  const trained = Array<boolean>(7).fill(false)
  let count = 0
  for (const ts of sessionStarts) {
    if (ts < monday || ts >= addDays(monday, 7)) continue
    count++
    trained[(new Date(ts).getDay() + 6) % 7] = true
  }
  return { trained, todayIndex: (new Date(now).getDay() + 6) % 7, count }
}

/**
 * Weeks in a row with at least one workout. This week counts once you've trained in it, but an
 * empty week so far doesn't break the streak until it's over.
 */
export function weekStreak(sessionStarts: number[], now: number): number {
  const weeks = new Set(sessionStarts.map(startOfWeek))
  let week = startOfWeek(now)
  if (!weeks.has(week)) week = addDays(week, -7)
  let streak = 0
  while (weeks.has(week)) {
    streak++
    week = addDays(week, -7)
  }
  return streak
}

/** Seconds a working set takes, on top of its rest. */
const SET_SEC = 40

/** Rough length of a plan day, rounded to 5 minutes: each set plus the rest after it. */
export function estimateMinutes(exercises: { targetSets: number; restSec: number }[]): number {
  const sec = exercises.reduce((sum, e) => sum + e.targetSets * (SET_SEC + e.restSec), 0)
  return Math.max(5, Math.round(sec / 300) * 5)
}
