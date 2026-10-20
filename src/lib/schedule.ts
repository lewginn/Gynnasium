import type { Plan, PlanDay } from './types'

// The calendar: what's on a given date. A goal's phases are plans with dates (startsOn–endsOn) and are
// used on those dates; otherwise the active plan applies. Plan days can be fixed to weekdays; with
// alternating weeks, week A and B alternate by calendar week from the plan's start. Days off skip
// whatever was scheduled. A plan with no fixed weekdays keeps the "up next" rotation instead.
// Dates are local "YYYY-MM-DD" strings throughout.

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 12) // midday: daylight-saving changes never move the date
}
const format = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const todayKey = (now = Date.now()) => format(new Date(now))

export function addDays(date: string, days: number): string {
  const d = parse(date)
  d.setDate(d.getDate() + days)
  return format(d)
}

/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (date: string) => (parse(date).getDay() + 6) % 7

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000)
}

export interface PlanWithDays {
  plan: Plan
  /** Alive days, in the plan's order. */
  days: PlanDay[]
}

const isPhase = (plan: Plan) => !!(plan.startsOn && plan.endsOn)

/** The plan that applies on a date: a dated phase covering it, else the active plan if it isn't a dated phase. */
export function planOn(date: string, plans: PlanWithDays[]): PlanWithDays | null {
  const phases = plans
    .filter(({ plan }) => isPhase(plan) && plan.startsOn! <= date && date <= plan.endsOn!)
    .sort((a, b) => b.plan.startsOn!.localeCompare(a.plan.startsOn!))
  if (phases[0]) return phases[0]
  return plans.find(({ plan }) => plan.isActive && !isPhase(plan)) ?? null
}

export const hasSchedule = (days: Pick<PlanDay, 'weekdays'>[]) => days.some((d) => (d.weekdays?.length ?? 0) > 0)

/** Week A (1) or B (2) on a date, counting calendar weeks from the plan's start (or a fixed Monday). */
export function weekOn(date: string, plan: Pick<Plan, 'startsOn'>): 1 | 2 {
  const anchor = plan.startsOn ?? '2024-01-01' // a Monday
  const mondayOf = (d: string) => addDays(d, -weekdayOf(d))
  const weeks = Math.floor(daysBetween(mondayOf(anchor), mondayOf(date)) / 7)
  return ((((weeks % 2) + 2) % 2) === 0 ? 1 : 2) as 1 | 2
}

export type DayPlan =
  /** A workout is scheduled. */
  | { kind: 'workout'; plan: Plan; day: PlanDay }
  /** The plan has fixed weekdays and none falls today. */
  | { kind: 'rest'; plan: Plan }
  /** Marked as a day off; `skipped` is what would have been on. */
  | { kind: 'off'; note?: string; skipped?: { plan: Plan; day: PlanDay } }
  /** The plan has no fixed weekdays: Today uses the up-next rotation. */
  | { kind: 'rotation'; plan: Plan }
  | { kind: 'none' }

export function scheduledDay(date: string, { plan, days }: PlanWithDays): PlanDay | null {
  const weekday = weekdayOf(date)
  const week = weekOn(date, plan)
  return days.find((d) => d.weekdays?.includes(weekday) && (!d.week || d.week === week)) ?? null
}

export function dayPlan(date: string, plans: PlanWithDays[], daysOff: Map<string, string | undefined>): DayPlan {
  const entry = planOn(date, plans)
  const scheduled = entry && hasSchedule(entry.days) ? scheduledDay(date, entry) : null
  if (daysOff.has(date)) return { kind: 'off', note: daysOff.get(date), ...(scheduled && entry ? { skipped: { plan: entry.plan, day: scheduled } } : {}) }
  if (!entry) return { kind: 'none' }
  if (!hasSchedule(entry.days)) return { kind: 'rotation', plan: entry.plan }
  return scheduled ? { kind: 'workout', plan: entry.plan, day: scheduled } : { kind: 'rest', plan: entry.plan }
}

/** The next scheduled workout strictly after `date`, within `horizon` days. */
export function nextWorkout(
  date: string,
  plans: PlanWithDays[],
  daysOff: Map<string, string | undefined>,
  horizon = 28,
): { date: string; plan: Plan; day: PlanDay } | null {
  for (let i = 1; i <= horizon; i++) {
    const d = addDays(date, i)
    const p = dayPlan(d, plans, daysOff)
    if (p.kind === 'workout') return { date: d, plan: p.plan, day: p.day }
  }
  return null
}

/** The dates shown for a month: whole weeks, Monday first, with days from the months either side. */
export function monthGrid(year: number, month: number): { date: string; inMonth: boolean }[][] {
  const first = format(new Date(year, month, 1, 12))
  const start = addDays(first, -weekdayOf(first))
  const weeks: { date: string; inMonth: boolean }[][] = []
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, w * 7 + i)
      return { date, inMonth: parse(date).getMonth() === month }
    })
    if (w > 3 && !week.some((d) => d.inMonth)) break
    weeks.push(week)
  }
  return weeks
}

/** "Mon 3 Nov" */
export function shortDate(date: string): string {
  return parse(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "3 November 2026" */
export function longDate(date: string): string {
  return parse(date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}
