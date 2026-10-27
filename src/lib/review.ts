import { MUSCLE_LABELS } from './labels'
import { defaultRepRange, suggestNext, type DoneSet } from './progression'
import { PR_LABELS } from './prs'
import { addDays, dayPlan, hasSchedule, planOn, weekdayOf, type PlanWithDays } from './schedule'
import { weeklySetsByMuscle } from './suggest'
import { bestSet, countsForStats, formatSet } from './summary'
import type { Exercise, LoggingType, Muscle, PlanExercise, PRType, SetLog, Units, WorkoutSession } from './types'
import { weekSummary } from './week'
import { daysPerWeek } from './weeks'

// The weekly review: last Monday–Sunday, from what's logged and planned. Only numbers the app can back:
// workouts and sets against the plan, PRs, lifts that haven't moved, and sets per muscle. Built locally;
// the coach only sees it when you ask it to.

/** Working sets a week below which a muscle the plan trains is flagged. */
export const LOW_MUSCLE_SETS = 10
/** Workouts of an exercise without a better top set before it counts as stalled. */
export const STALL_WORKOUTS = 3
/** The first message when you take the review to the coach. You send it yourself. */
export const REVIEW_PROMPT = 'Review last week and suggest changes to my plan'

export interface ReviewInput {
  /** Today, local YYYY-MM-DD. The review covers the Monday–Sunday before this week. */
  today: string
  plans: PlanWithDays[]
  planExercises: PlanExercise[]
  daysOff: Map<string, string | undefined>
  /** Finished workouts with their sets (warm-ups and unticked sets are dropped here). */
  workouts: { session: WorkoutSession; sets: SetLog[] }[]
  exercises: Map<string, Exercise>
  units: Units
}

export interface ReviewPR {
  exercise: Exercise
  /** The best of that week's PR sets for the exercise. */
  set: SetLog
  kinds: PRType[]
}

export interface StalledLift {
  exercise: Exercise
  /** The top set the later workouts didn't beat. */
  best: SetLog
  /** What the next workout will suggest (the same line the workout shows). */
  note: string | null
}

export interface WeeklyReview {
  /** Monday and Sunday of the week reviewed. */
  from: string
  to: string
  hasPlan: boolean
  /** Planned is null without a plan. */
  workouts: { done: number; planned: number | null }
  /** Working sets in the workouts done from a plan day, against that day's target sets; null when none were. */
  planSets: { done: number; planned: number } | null
  /** Every working set that week. */
  totalSets: number
  prs: ReviewPR[]
  stalled: StalledLift[]
  /** Working sets per primary muscle, most first. */
  muscles: { muscle: Muscle; sets: number }[]
  /** Muscles the plan trains with fewer than LOW_MUSCLE_SETS working sets, fewest first. */
  lowMuscles: { muscle: Muscle; sets: number }[]
}

const alive = <T extends { deletedAt?: number }>(row: T) => !row.deletedAt

/** Seconds for timed exercises, reps otherwise. */
const amount = (s: DoneSet, logging: LoggingType) => (logging === 'time' ? (s.durationSec ?? 0) : s.reps)

/**
 * How good a workout's sets of one exercise were: the top weight, the best set at it, then everything done
 * at it (so adding reps to the later sets, as double progression does, counts as moving on).
 */
function workoutKey(sets: DoneSet[], logging: LoggingType): number[] {
  const top = Math.max(...sets.map((s) => s.weightKg))
  const atTop = sets.filter((s) => s.weightKg === top).map((s) => amount(s, logging))
  return [top, Math.max(...atTop), atTop.reduce((a, b) => a + b, 0)]
}

const compare = (a: number[], b: number[]) => {
  const i = a.findIndex((v, j) => v !== b[j])
  return i < 0 ? 0 : a[i] - b[i]
}

/**
 * Stalled: none of the last STALL_WORKOUTS - 1 workouts beat the one before them. `history` is newest first.
 * Returns the set they didn't get past.
 */
export function stalledBest(history: SetLog[][], logging: LoggingType): SetLog | null {
  if (history.length < STALL_WORKOUTS) return null
  const [oldest, ...later] = history.slice(0, STALL_WORKOUTS).reverse()
  const base = workoutKey(oldest, logging)
  if (later.some((sets) => compare(workoutKey(sets, logging), base) > 0)) return null
  const top = Math.max(...oldest.map((s) => s.weightKg))
  return bestSet(oldest.filter((s) => s.weightKg === top)) ?? null
}

export function weeklyReview({ today, plans, planExercises, daysOff, workouts, exercises, units }: ReviewInput): WeeklyReview {
  const from = addDays(today, -weekdayOf(today) - 7)
  const to = addDays(from, 6)
  const dates = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const livePlans = plans.filter((p) => alive(p.plan)).map((p) => ({ plan: p.plan, days: p.days.filter(alive) }))
  const pes = planExercises.filter(alive)
  const dayIds = new Set(livePlans.flatMap((p) => p.days.map((d) => d.id)))

  // Planned workouts: scheduled days (days off already skip them), or a rotation plan's days per week.
  const onDates = dates.map((d) => planOn(d, livePlans))
  const hasPlan = onDates.some(Boolean)
  const scheduled = dates.filter((d) => dayPlan(d, livePlans, daysOff).kind === 'workout').length
  const rotation = onDates.find((p) => p && !hasSchedule(p.days))
  const planned = hasPlan ? scheduled + (rotation ? daysPerWeek(rotation.days) : 0) : null

  // Finished, alive workouts with their ticked working sets, newest first.
  const done = workouts
    .filter(({ session }) => alive(session) && !!session.endedAt)
    .map(({ session, sets }) => ({ session, sets: sets.filter((s) => alive(s) && countsForStats(s)) }))
    .sort((a, b) => b.session.startedAt - a.session.startedAt)
  const weekStart = new Date(`${from}T00:00`).getTime()
  const weekEnd = new Date(`${addDays(to, 1)}T00:00`).getTime()
  const inWeek = done.filter(({ session }) => session.startedAt >= weekStart && session.startedAt < weekEnd)
  const upToWeekEnd = done.filter(({ session }) => session.startedAt < weekEnd)
  const weekSets = inWeek.flatMap((w) => w.sets).filter((s) => exercises.has(s.exerciseId))

  // Sets against the plan, for workouts started from a plan day.
  const fromPlan = inWeek.filter(({ session }) => session.planDayId && dayIds.has(session.planDayId))
  const planSets =
    fromPlan.length === 0
      ? null
      : {
          done: fromPlan.reduce((n, w) => n + w.sets.length, 0),
          planned: fromPlan.reduce((n, w) => n + pes.filter((pe) => pe.planDayId === w.session.planDayId).reduce((m, pe) => m + pe.targetSets, 0), 0),
        }

  // PRs: one line per exercise, its best PR set that week.
  const prSets = new Map<string, SetLog[]>()
  for (const s of [...weekSets].sort((a, b) => a.completedAt! - b.completedAt!))
    if (s.prs?.length) prSets.set(s.exerciseId, [...(prSets.get(s.exerciseId) ?? []), s])
  const prs = [...prSets.entries()].map(([id, sets]) => {
    const kinds = new Set(sets.flatMap((s) => s.prs ?? []))
    return { exercise: exercises.get(id)!, set: bestSet(sets)!, kinds: (Object.keys(PR_LABELS) as PRType[]).filter((k) => kinds.has(k)) }
  })

  // Stalled lifts, with what the workout will suggest next: the same target and history it uses.
  const stalled: StalledLift[] = []
  const weekExerciseIds = [...new Set([...weekSets].sort((a, b) => a.completedAt! - b.completedAt!).map((s) => s.exerciseId))]
  for (const id of weekExerciseIds) {
    const exercise = exercises.get(id)!
    const history: SetLog[][] = []
    for (const w of upToWeekEnd) {
      const bySe = new Map<string, SetLog[]>()
      for (const s of w.sets) if (s.exerciseId === id) bySe.set(s.sessionExerciseId, [...(bySe.get(s.sessionExerciseId) ?? []), s])
      for (const sets of bySe.values()) history.push(sets.sort((a, b) => a.setNumber - b.setNumber))
      if (history.length >= STALL_WORKOUTS) break
    }
    const best = stalledBest(history, exercise.logging)
    if (!best) continue
    const lastDayId = inWeek.find((w) => w.sets.some((s) => s.exerciseId === id))?.session.planDayId
    const pe = pes.find((p) => p.planDayId === lastDayId && p.exerciseId === id)
    const rule = pe?.progressionRule ?? 'double_progression'
    if (rule === 'none') continue // progression is off for it: holding steady is the point
    const [repMin, repMax] = pe ? [pe.repMin, pe.repMax] : defaultRepRange(exercise)
    const target = { sets: pe?.targetSets ?? 3, repMin, repMax }
    const { note } = suggestNext({ history: history.slice(0, 2), target, exercise, rule, units })
    stalled.push({ exercise, best, note })
  }

  // Sets per muscle, and the plan's muscles that got too few.
  const perExercise = new Map<string, number>()
  for (const s of weekSets) perExercise.set(s.exerciseId, (perExercise.get(s.exerciseId) ?? 0) + 1)
  const totals = weeklySetsByMuscle([...perExercise.entries()].map(([id, sets]) => ({ exercise: exercises.get(id)!, sets })))
  const muscles = [...totals.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets)
  const weekDayIds = new Set(onDates.flatMap((p) => p?.days.map((d) => d.id) ?? []))
  const trained = new Set(pes.filter((pe) => weekDayIds.has(pe.planDayId)).flatMap((pe) => exercises.get(pe.exerciseId)?.primaryMuscles ?? []))
  const lowMuscles = [...trained]
    .map((muscle) => ({ muscle, sets: totals.get(muscle) ?? 0 }))
    .filter((m) => m.sets < LOW_MUSCLE_SETS)
    .sort((a, b) => a.sets - b.sets || MUSCLE_LABELS[a.muscle].localeCompare(MUSCLE_LABELS[b.muscle]))

  return {
    from,
    to,
    hasPlan,
    workouts: { done: weekSummary(inWeek.map((w) => w.session.startedAt), weekStart).count, planned },
    planSets,
    totalSets: weekSets.length,
    prs,
    stalled,
    muscles,
    lowMuscles,
  }
}

/** Worth showing: last week had a plan or any workouts. */
export const hasReview = (r: WeeklyReview) => r.hasPlan || r.workouts.done > 0

/** Today offers the review Monday to Wednesday only. */
export const showReviewOnToday = (r: WeeklyReview, today: string) => weekdayOf(today) <= 2 && hasReview(r)

/** "2 of 3 workouts · 1 PR" */
export function reviewHeadline(r: WeeklyReview): string {
  const { done, planned } = r.workouts
  const parts = [planned !== null ? `${done} of ${planned} workouts` : `${done} ${done === 1 ? 'workout' : 'workouts'}`]
  if (r.prs.length) parts.push(`${r.prs.length} ${r.prs.length === 1 ? 'PR' : 'PRs'}`)
  return parts.join(' · ')
}

/** The review as context for the coach, with library ids so it can match them to the plan. */
export function reviewText(r: WeeklyReview, units: Units): string {
  const set = (s: SetLog, e: Exercise) => formatSet(s, { units }, e.logging)
  const lines = [`Last week's review (${r.from} to ${r.to}), from the app's logs:`]
  lines.push(r.workouts.planned !== null ? `Workouts: ${r.workouts.done} of ${r.workouts.planned} planned.` : `Workouts: ${r.workouts.done} (no plan).`)
  if (r.planSets) lines.push(`Working sets in workouts from the plan: ${r.planSets.done} of ${r.planSets.planned} planned.`)
  lines.push(`Working sets in all: ${r.totalSets}.`)
  if (r.prs.length) lines.push(`PRs: ${r.prs.map((p) => `${p.exercise.id} ${set(p.set, p.exercise)} (${p.kinds.map((k) => PR_LABELS[k]).join(', ')})`).join('; ')}.`)
  if (r.stalled.length) {
    lines.push(`Stalled (no better top set in ${STALL_WORKOUTS} workouts):`)
    for (const s of r.stalled) lines.push(`  ${s.exercise.id}: stuck at ${set(s.best, s.exercise)}${s.note ? `. The app's next suggestion: ${s.note}` : ''}`)
  }
  if (r.muscles.length) lines.push(`Working sets per muscle (primary muscles only): ${r.muscles.map((m) => `${m.muscle} ${m.sets}`).join(', ')}.`)
  if (r.lowMuscles.length)
    lines.push(`Under ${LOW_MUSCLE_SETS} sets, though the plan trains them: ${r.lowMuscles.map((m) => `${m.muscle} ${m.sets}`).join(', ')}.`)
  return lines.join('\n')
}
