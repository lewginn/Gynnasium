import type { PlanDay } from './types'

// Alternating weeks (A/B). Days with a week run in rotation: week A's days in order, then week B's.
// The rotation follows what you did last, not the calendar, so a missed day doesn't skip anything.

export const weekLetter = (week: 1 | 2) => (week === 1 ? 'A' : 'B')

export const alternates = (days: Pick<PlanDay, 'week'>[]) => days.some((d) => !!d.week)

/** "Push", or "Push · Week A" when the plan alternates weeks. */
export function dayLabel(day: Pick<PlanDay, 'name' | 'week'>): string {
  return day.week ? `${day.name} · Week ${weekLetter(day.week)}` : day.name
}

/** Rotation order: week A, then week B (days without a week first), each by its own order. */
export function sortDays<T extends Pick<PlanDay, 'week' | 'order'>>(days: T[]): T[] {
  return [...days].sort((a, b) => (a.week ?? 0) - (b.week ?? 0) || a.order - b.order)
}

/** The day after the one done last, wrapping round. Expects days in rotation order. */
export function nextDay<T extends { id: string }>(days: T[], lastDayId: string | undefined): T | null {
  if (days.length === 0) return null
  const i = days.findIndex((d) => d.id === lastDayId)
  return days[(i + 1) % days.length]
}

/** Workouts in a week: every day, or the bigger of the two weeks when they alternate. */
export function daysPerWeek(days: Pick<PlanDay, 'week'>[]): number {
  if (!alternates(days)) return days.length
  const a = days.filter((d) => d.week !== 2).length
  const b = days.filter((d) => d.week === 2).length
  return Math.max(a, b)
}
