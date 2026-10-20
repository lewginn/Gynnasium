import { daysBetween } from './schedule'
import type { BodyMetric, BodyMetricType, Goal, GoalTarget, Units } from './types'
import { formatWeight, toDisplay } from './units'

// Goals: how far there is to go on each target, from the day the goal was set to the target date.
// Bodyweight uses the 7-day average (daily weigh-ins swing by a kilo or two); measurements use the
// latest entry; a lift target is an estimated 1RM, using the best workout around each point in time.

export const METRIC_LABELS: Record<BodyMetricType, string> = {
  bodyweight: 'Bodyweight',
  bodyfat: 'Body fat',
  waist: 'Waist',
  chest: 'Chest',
  arm: 'Arm',
  thigh: 'Thigh',
}

export interface GoalData {
  metrics: Pick<BodyMetric, 'type' | 'date' | 'value'>[]
  /** Per exercise: best est. 1RM per workout, by date. */
  lifts: Map<string, { date: string; e1rm: number }[]>
  /** Exercise names for lift targets. */
  names: Map<string, string>
}

export interface TargetProgress {
  label: string
  /** 'weight' values are kg, shown in the user's units. */
  unit: 'weight' | '%' | 'cm'
  start: number | null
  current: number | null
  target: number
  direction: 'down' | 'up'
  done: boolean
  /** 0 at the start value, 1 at the target. */
  fraction: number | null
  /** Change still needed per week to arrive on the date (signed), or null when done or unknown. */
  perWeek: number | null
}

/** The 7-day average ending on `date` (or the latest value before it, if none that week). */
function averageAround(entries: { date: string; value: number }[], date: string): number | null {
  const upTo = entries.filter((e) => e.date <= date)
  if (upTo.length === 0) return null
  const last = upTo.at(-1)!.date
  const week = upTo.filter((e) => daysBetween(e.date, last) < 7)
  return week.reduce((s, e) => s + e.value, 0) / week.length
}

/** The value at the start of the goal: the latest on or before it, else the first after it. */
function startValue(entries: { date: string; value: number }[], startsOn: string, average: boolean): number | null {
  const before = entries.filter((e) => e.date <= startsOn)
  if (before.length) return average ? averageAround(entries, startsOn) : before.at(-1)!.value
  return entries[0]?.value ?? null
}

function series(target: GoalTarget, data: GoalData): { date: string; value: number }[] {
  if (target.kind === 'lift') return (data.lifts.get(target.exerciseId) ?? []).map((l) => ({ date: l.date, value: l.e1rm }))
  const type = target.kind === 'bodyweight' ? 'bodyweight' : target.metric
  return data.metrics.filter((m) => m.type === type).map((m) => ({ date: m.date, value: m.value }))
}

export function targetLabel(target: GoalTarget, names: Map<string, string>): string {
  if (target.kind === 'bodyweight') return 'Bodyweight'
  if (target.kind === 'measurement') return METRIC_LABELS[target.metric]
  return `${names.get(target.exerciseId) ?? target.exerciseId.replace(/_/g, ' ')} est. 1RM`
}

export function targetProgress(target: GoalTarget, goal: Pick<Goal, 'startsOn' | 'targetDate'>, data: GoalData, today: string): TargetProgress {
  const entries = series(target, data).sort((a, b) => a.date.localeCompare(b.date))
  const bodyweight = target.kind === 'bodyweight'
  const start = startValue(entries, goal.startsOn, bodyweight)
  const latest = entries.at(-1)
  const current = latest ? (bodyweight ? averageAround(entries, latest.date) : latest.value) : null
  const from = start ?? current
  const direction = from !== null && target.value < from ? 'down' : 'up'
  const done = current !== null && (direction === 'down' ? current <= target.value : current >= target.value)
  const fraction =
    start !== null && current !== null && start !== target.value ? Math.min(1, Math.max(0, (start - current) / (start - target.value))) : done ? 1 : null
  const weeksLeft = daysBetween(today, goal.targetDate) / 7
  const perWeek = !done && current !== null && weeksLeft > 0 ? (target.value - current) / weeksLeft : null
  return {
    label: targetLabel(target, data.names),
    unit: target.kind === 'measurement' ? (target.metric === 'bodyfat' ? '%' : 'cm') : 'weight',
    start,
    current,
    target: target.value,
    direction,
    done,
    fraction,
    perWeek,
  }
}

export function formatAmount(value: number, unit: TargetProgress['unit'], units: Units): string {
  if (unit === 'weight') return formatWeight(value, units)
  return `${Number(value.toFixed(1))}${unit === '%' ? '%' : ' cm'}`
}

/** "0.4kg a week to go" style pace, in the user's units. */
export function formatPace(p: TargetProgress, units: Units): string | null {
  if (p.perWeek === null) return null
  const size = Math.abs(p.unit === 'weight' ? toDisplay(p.perWeek, units) : p.perWeek)
  const unit = p.unit === 'weight' ? units : p.unit === '%' ? '%' : ' cm'
  const verb = p.perWeek < 0 ? 'down' : 'up'
  return `${Number(size.toFixed(size < 1 ? 2 : 1))}${unit} a week ${verb}`
}

export interface Countdown {
  daysLeft: number
  weeksLeft: number
  passed: boolean
}

export function countdown(goal: Pick<Goal, 'targetDate'>, today: string): Countdown {
  const daysLeft = daysBetween(today, goal.targetDate)
  return { daysLeft, weeksLeft: Math.floor(Math.max(0, daysLeft) / 7), passed: daysLeft < 0 }
}

/** "45 days to go", "Tomorrow", "Today", "2 weeks ago". */
export function countdownText({ daysLeft }: Countdown): string {
  if (daysLeft === 0) return 'Today'
  if (daysLeft === 1) return 'Tomorrow'
  if (daysLeft > 1) return `${daysLeft} days to go`
  const ago = -daysLeft
  return ago < 14 ? `${ago} ${ago === 1 ? 'day' : 'days'} ago` : `${Math.floor(ago / 7)} weeks ago`
}
