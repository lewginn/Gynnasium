import type { PlanChange, ProposedGoalPlan, ProposedNutrition, ProposedPlan } from './coachSchema'
import { formatAmount, type TargetProgress } from './goals'
import { WEEKDAY_NAMES, addDays, daysBetween, weekdayOf } from './schedule'
import { formatRest } from './format'
import type { Exercise, Goal, LoggingType, Plan, PlanDay, PlanExercise, Units } from './types'
import { formatWeight } from './units'
import { weekLetter } from './weeks'

// The coach sees the plan as text with short refs (d1, x1) and answers with changes against those refs.
// Everything Claude sends back is checked here before the user sees it: unknown exercises and refs are dropped,
// numbers are kept in sane ranges. Nothing is written until the user taps Apply.

export interface CoachPlan {
  plan: Plan
  days: { day: PlanDay; exercises: { pe: PlanExercise; exercise: Exercise }[] }[]
}

export interface PlanRefs {
  days: Map<string, string>
  exercises: Map<string, string>
}

export function planRefs(detail: CoachPlan): PlanRefs {
  const refs: PlanRefs = { days: new Map(), exercises: new Map() }
  let x = 0
  detail.days.forEach(({ day, exercises }, i) => {
    refs.days.set(`d${i + 1}`, day.id)
    for (const { pe } of exercises) refs.exercises.set(`x${++x}`, pe.id)
  })
  return refs
}

const target = (sets: number, min: number, max: number, logging: LoggingType) => {
  const unit = logging === 'time' ? ' s' : ''
  return `${sets} × ${min === max ? min : `${min}–${max}`}${unit}`
}

export function planText(detail: CoachPlan): string {
  const lines = [`Current plan: "${detail.plan.name}"${detail.plan.isActive ? ' (active)' : ''}${detail.plan.goal ? `. Goal: ${detail.plan.goal}` : ''}`]
  if (detail.days.length === 0) lines.push('(no days yet)')
  let x = 0
  detail.days.forEach(({ day, exercises }, i) => {
    const week = day.week ? ` [week ${weekLetter(day.week)}]` : ''
    lines.push(`d${i + 1} ${day.name}${week}${day.focusMuscles.length ? ` (focus: ${day.focusMuscles.join(', ')})` : ''}`)
    if (exercises.length === 0) lines.push('  (no exercises)')
    for (const { pe, exercise } of exercises)
      lines.push(`  x${++x} ${exercise.id}: ${target(pe.targetSets, pe.repMin, pe.repMax, exercise.logging)}, rest ${pe.restSec} s`)
  })
  return lines.join('\n')
}

export interface TrainingSummary {
  workouts: number
  weeks: number
  bodyweightKg?: { value: number; date: string }
  lifts: { exercise: Exercise; weightKg: number; reps: number; durationSec?: number; e1rmKg: number | null; date: string }[]
  otherPlans: string[]
}

export function trainingText(t: TrainingSummary, units: Units): string {
  const lines = [`Units: ${units}`]
  lines.push(
    t.workouts === 0
      ? 'Training: no workouts logged in the app yet.'
      : `Training: ${t.workouts} workouts in the last ${t.weeks} weeks (about ${(t.workouts / t.weeks).toFixed(1)} a week).`,
  )
  if (t.bodyweightKg) lines.push(`Bodyweight: ${formatWeight(t.bodyweightKg.value, units)} (${t.bodyweightKg.date})`)
  if (t.lifts.length > 0) {
    lines.push(`Best recent sets (last ${t.weeks} weeks):`)
    for (const l of t.lifts) {
      const set =
        l.exercise.logging === 'time'
          ? `${l.durationSec ?? 0} s`
          : l.exercise.logging === 'bodyweight'
            ? `${l.reps} reps${l.weightKg ? ` (${l.weightKg > 0 ? '+' : ''}${formatWeight(l.weightKg, units)})` : ''}`
            : `${formatWeight(l.weightKg, units)} × ${l.reps}${l.e1rmKg ? ` (est. 1RM ${formatWeight(l.e1rmKg, units)})` : ''}`
      lines.push(`  ${l.exercise.id}: ${set}, ${l.date}`)
    }
  }
  if (t.otherPlans.length > 0) lines.push(`Their other plans: ${t.otherPlans.join(', ')}`)
  return lines.join('\n')
}

// ---------------------------------------------------------------- Checking what Claude proposes

/** Distinct weekdays 0–6, sorted; null when there are none. */
export const asWeekdays = (w: unknown): number[] | null => {
  const days = Array.isArray(w) ? [...new Set(w.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []
  return days.length ? days : null
}

/** Claude's week, or null for anything that isn't week A (1) or B (2). */
const asWeek = (w: unknown): 1 | 2 | null => (w === 1 || w === 2 ? w : null)

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)))

/** Keeps sets, reps and rest within what the app can show and log. */
export function sanitiseTarget(
  t: { sets: number; repMin: number; repMax: number; restSec: number },
  logging: LoggingType,
): { sets: number; repMin: number; repMax: number; restSec: number } {
  const [lo, hi] = logging === 'time' ? [5, 600] : [1, 100]
  const a = clamp(t.repMin, lo, hi)
  const b = clamp(t.repMax, lo, hi)
  return { sets: clamp(t.sets, 1, 10), repMin: Math.min(a, b), repMax: Math.max(a, b), restSec: clamp(t.restSec, 0, 600) }
}

export interface CheckedPlan {
  plan: ProposedPlan
  skipped: string[]
}

export function checkNewPlan(proposed: ProposedPlan, library: Map<string, Exercise>): CheckedPlan {
  const skipped: string[] = []
  const days = proposed.days
    .map((d) => ({
      name: d.name.trim() || 'Day',
      focusMuscles: d.focusMuscles,
      week: asWeek(d.week),
      weekdays: asWeekdays(d.weekdays),
      exercises: d.exercises.flatMap((e) => {
        const ex = library.get(e.exerciseId)
        if (!ex) {
          skipped.push(`${e.exerciseId} isn't in the exercise library`)
          return []
        }
        return [{ exerciseId: ex.id, ...sanitiseTarget(e, ex.logging) }]
      }),
    }))
    .filter((d) => d.exercises.length > 0)
  return { plan: { name: proposed.name.trim() || 'New plan', goal: proposed.goal.trim(), days }, skipped }
}

type Target = { sets: number; repMin: number; repMax: number; restSec: number }

/** A change resolved to real row ids and library exercises, ready to preview and apply. */
export type ResolvedChange = { reason: string } & (
  | { op: 'add_exercise'; dayId: string; exercise: Exercise; target: Target; position: number | null }
  | { op: 'remove_exercise'; planExerciseId: string }
  | { op: 'replace_exercise'; planExerciseId: string; exercise: Exercise; target: Partial<Target> }
  | { op: 'update_exercise'; planExerciseId: string; target: Partial<Target> }
  | { op: 'move_exercise'; planExerciseId: string; position: number }
  | { op: 'add_day'; name: string; exercises: { exercise: Exercise; target: Target }[]; week: 1 | 2 | null }
  | { op: 'set_day_week'; dayId: string; week: 1 | 2 | null }
  | { op: 'remove_day'; dayId: string }
  | { op: 'rename_day'; dayId: string; name: string }
  | { op: 'rename_plan'; name: string }
)

export interface CheckedChanges {
  changes: ResolvedChange[]
  skipped: string[]
}

const partialTarget = (c: PlanChange, current: Target, logging: LoggingType): Partial<Target> => {
  const merged = sanitiseTarget(
    { sets: c.sets ?? current.sets, repMin: c.repMin ?? current.repMin, repMax: c.repMax ?? current.repMax, restSec: c.restSec ?? current.restSec },
    logging,
  )
  const out: Partial<Target> = {}
  for (const k of ['sets', 'repMin', 'repMax', 'restSec'] as const) if (merged[k] !== current[k]) out[k] = merged[k]
  return out
}

export function checkChanges(changes: PlanChange[], detail: CoachPlan, library: Map<string, Exercise>): CheckedChanges {
  const refs = planRefs(detail)
  const rows = new Map(detail.days.flatMap((d) => d.exercises.map((x) => [x.pe.id, x] as const)))
  const out: ResolvedChange[] = []
  const skipped: string[] = []
  const skip = (c: PlanChange, why: string) => skipped.push(`${c.op.replace('_', ' ')}: ${why}`)

  for (const c of changes) {
    const reason = c.reason.trim()
    const dayId = c.day ? refs.days.get(c.day) : undefined
    const peId = c.exercise ? refs.exercises.get(c.exercise) : undefined
    const row = peId ? rows.get(peId) : undefined
    const ex = c.exerciseId ? library.get(c.exerciseId) : undefined
    const current: Target | undefined = row && { sets: row.pe.targetSets, repMin: row.pe.repMin, repMax: row.pe.repMax, restSec: row.pe.restSec }
    const name = c.name?.trim()

    switch (c.op) {
      case 'add_exercise':
        if (!dayId) skip(c, `no day ${c.day}`)
        else if (!ex) skip(c, `${c.exerciseId} isn't in the exercise library`)
        else
          out.push({
            op: c.op,
            reason,
            dayId,
            exercise: ex,
            target: sanitiseTarget({ sets: c.sets ?? 3, repMin: c.repMin ?? 8, repMax: c.repMax ?? 12, restSec: c.restSec ?? ex.defaultRestSec }, ex.logging),
            position: c.position,
          })
        break
      case 'remove_exercise':
        if (!peId) skip(c, `no exercise ${c.exercise}`)
        else out.push({ op: c.op, reason, planExerciseId: peId })
        break
      case 'replace_exercise':
        if (!peId || !current) skip(c, `no exercise ${c.exercise}`)
        else if (!ex) skip(c, `${c.exerciseId} isn't in the exercise library`)
        else out.push({ op: c.op, reason, planExerciseId: peId, exercise: ex, target: partialTarget(c, current, ex.logging) })
        break
      case 'update_exercise': {
        if (!peId || !row || !current) {
          skip(c, `no exercise ${c.exercise}`)
          break
        }
        const target = partialTarget(c, current, row.exercise.logging)
        if (Object.keys(target).length > 0) out.push({ op: c.op, reason, planExerciseId: peId, target })
        break
      }
      case 'move_exercise':
        if (!peId) skip(c, `no exercise ${c.exercise}`)
        else if (c.position === null) skip(c, 'no position')
        else out.push({ op: c.op, reason, planExerciseId: peId, position: Math.max(1, Math.round(c.position)) })
        break
      case 'add_day': {
        const exercises = (c.exercises ?? []).flatMap((e) => {
          const found = library.get(e.exerciseId)
          if (!found) skipped.push(`add day: ${e.exerciseId} isn't in the exercise library`)
          return found ? [{ exercise: found, target: sanitiseTarget(e, found.logging) }] : []
        })
        out.push({ op: c.op, reason, name: name || 'New day', exercises, week: asWeek(c.week) })
        break
      }
      case 'remove_day':
        if (!dayId) skip(c, `no day ${c.day}`)
        else out.push({ op: c.op, reason, dayId })
        break
      case 'rename_day':
        if (!dayId) skip(c, `no day ${c.day}`)
        else if (!name) skip(c, 'no name')
        else out.push({ op: c.op, reason, dayId, name })
        break
      case 'set_day_week':
        if (!dayId) skip(c, `no day ${c.day}`)
        else out.push({ op: c.op, reason, dayId, week: asWeek(c.week) })
        break
      case 'rename_plan':
        if (!name) skip(c, 'no name')
        else out.push({ op: c.op, reason, name })
        break
    }
  }
  return { changes: out, skipped }
}

// ---------------------------------------------------------------- Previewing

export type ChangeKind = 'add' | 'remove' | 'swap' | 'edit' | 'move'

export interface ChangeLine {
  kind: ChangeKind
  title: string
  detail: string
}

export function describeTarget(t: Target, logging: LoggingType): string {
  return `${target(t.sets, t.repMin, t.repMax, logging)}, rest ${formatRest(t.restSec)}`
}

/** Only what changes: "3 → 4 sets · rest 1:30 → 2 min". */
export function describeEdit(from: Target, to: Target, logging: LoggingType): string {
  const range = (t: Target) => (t.repMin === t.repMax ? `${t.repMin}` : `${t.repMin}–${t.repMax}`)
  const parts: string[] = []
  if (from.sets !== to.sets) parts.push(`${from.sets} → ${to.sets} sets`)
  if (range(from) !== range(to)) parts.push(`${range(from)} → ${range(to)} ${logging === 'time' ? 's' : 'reps'}`)
  if (from.restSec !== to.restSec) parts.push(`rest ${formatRest(from.restSec)} → ${formatRest(to.restSec)}`)
  return parts.join(' · ')
}

/** One line per change for the preview: what happens, where, and why. */
export function describeChange(c: ResolvedChange, detail: CoachPlan): ChangeLine {
  const dayName = (id: string) => detail.days.find((d) => d.day.id === id)?.day.name ?? 'a day'
  const row = (id: string) => {
    for (const d of detail.days) for (const x of d.exercises) if (x.pe.id === id) return { ...x, dayName: d.day.name }
    return undefined
  }
  const why = (s: string) => [s, c.reason].filter(Boolean).join(' · ')
  switch (c.op) {
    case 'add_exercise':
      return { kind: 'add', title: c.exercise.name, detail: why(`Add to ${dayName(c.dayId)}: ${describeTarget(c.target, c.exercise.logging)}`) }
    case 'remove_exercise': {
      const r = row(c.planExerciseId)
      return { kind: 'remove', title: r?.exercise.name ?? 'Exercise', detail: why(`Remove from ${r?.dayName ?? 'the plan'}`) }
    }
    case 'replace_exercise': {
      const r = row(c.planExerciseId)
      return { kind: 'swap', title: `${r?.exercise.name ?? 'Exercise'} → ${c.exercise.name}`, detail: why(`In ${r?.dayName ?? 'the plan'}`) }
    }
    case 'update_exercise': {
      const r = row(c.planExerciseId)!
      const now = { sets: r.pe.targetSets, repMin: r.pe.repMin, repMax: r.pe.repMax, restSec: r.pe.restSec }
      return { kind: 'edit', title: r.exercise.name, detail: why(describeEdit(now, { ...now, ...c.target }, r.exercise.logging)) }
    }
    case 'move_exercise': {
      const r = row(c.planExerciseId)
      return { kind: 'move', title: r?.exercise.name ?? 'Exercise', detail: why(`Move to position ${c.position} in ${r?.dayName ?? 'its day'}`) }
    }
    case 'set_day_week':
      return { kind: 'move', title: dayName(c.dayId), detail: why(c.week ? `Move to week ${weekLetter(c.week)}` : 'Every week') }
    case 'add_day':
      return { kind: 'add', title: `New day: ${c.name}${c.week ? ` (week ${weekLetter(c.week)})` : ''}`, detail: why(c.exercises.map((e) => e.exercise.name).join(', ') || 'No exercises yet') }
    case 'remove_day':
      return { kind: 'remove', title: `Day: ${dayName(c.dayId)}`, detail: why('Remove the day and its exercises') }
    case 'rename_day':
      return { kind: 'edit', title: `${dayName(c.dayId)} → ${c.name}`, detail: why('Rename day') }
    case 'rename_plan':
      return { kind: 'edit', title: `${detail.plan.name} → ${c.name}`, detail: why('Rename plan') }
  }
}

// ---------------------------------------------------------------- Planning to a goal

/** The goal, how each target stands, days off and any phases already planned, as context for the coach. */
export function goalText(
  goal: Goal,
  progress: TargetProgress[],
  phases: Pick<Plan, 'name' | 'startsOn' | 'endsOn'>[],
  daysOff: string[],
  today: string,
  units: Units,
): string {
  const days = daysBetween(today, goal.targetDate)
  const lines = [
    `Today: ${today} (${WEEKDAY_NAMES[weekdayOf(today)]})`,
    `Goal: "${goal.name}" on ${goal.targetDate}: ${days} days (${Math.floor(days / 7)} weeks) away.`,
  ]
  if (goal.description) lines.push(`What it's for: ${goal.description}`)
  if (progress.length) {
    lines.push('Targets:')
    for (const p of progress) {
      const fmt = (v: number | null) => (v === null ? 'not logged' : formatAmount(v, p.unit, units))
      lines.push(`  ${p.label}: now ${fmt(p.current)}, target ${fmt(p.target)}${p.start !== null ? `, started at ${fmt(p.start)}` : ''}`)
    }
  } else lines.push('Targets: none set (plan from the description).')
  lines.push(goal.calories ? `Current nutrition targets: ${goal.calories} kcal, ${goal.proteinG ?? '?'} g protein a day.` : 'No nutrition targets yet.')
  const off = daysOff.filter((d) => d >= today && d <= goal.targetDate)
  if (off.length) lines.push(`Days off (no training): ${off.join(', ')}`)
  if (phases.length) lines.push(`Current phases: ${phases.map((p) => `${p.name} ${p.startsOn}–${p.endsOn}`).join('; ')}`)
  return lines.join('\n')
}

export interface CheckedPhase {
  name: string
  startsOn: string
  endsOn: string
  focus: string
  plan: ProposedPlan
}

export interface CheckedGoalPlan {
  phases: CheckedPhase[]
  nutrition: ProposedNutrition | null
  skipped: string[]
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

/**
 * Phases kept inside today…goal date, in order and without overlaps (a phase that starts before the
 * previous one ends is moved to start the day after); each plan checked like a new plan.
 */
export function checkGoalPlan(
  proposed: ProposedGoalPlan,
  goal: Pick<Goal, 'targetDate'>,
  library: Map<string, Exercise>,
  today: string,
): CheckedGoalPlan {
  const skipped: string[] = []
  const phases: CheckedPhase[] = []
  const sorted = [...proposed.phases].filter((p) => isDate(p.startsOn) && isDate(p.endsOn)).sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  if (sorted.length < proposed.phases.length) skipped.push('a phase with dates that don’t make sense')
  for (const p of sorted) {
    const prevEnd = phases.at(-1)?.endsOn
    const startsOn = [p.startsOn, today, prevEnd ? addDays(prevEnd, 1) : today].sort().at(-1)!
    const endsOn = p.endsOn > goal.targetDate ? goal.targetDate : p.endsOn
    if (endsOn < startsOn) {
      skipped.push(`${p.name}: outside the time to the goal`)
      continue
    }
    const checked = checkNewPlan(p.plan, library)
    skipped.push(...checked.skipped)
    if (checked.plan.days.length === 0) {
      skipped.push(`${p.name}: no usable exercises`)
      continue
    }
    const name = p.name.trim() || 'Phase'
    // The phase's plan is named after the phase: the goal page and Today show it as "Phase: Build".
    phases.push({ name, startsOn, endsOn, focus: p.focus.trim(), plan: { ...checked.plan, name, goal: p.focus.trim() || checked.plan.goal } })
  }
  const n = proposed.nutrition
  const nutrition = n && n.calories >= 1000 && n.calories <= 6000 && n.proteinG >= 30 && n.proteinG <= 400 ? { ...n, note: n.note.trim() } : null
  if (n && !nutrition) skipped.push('nutrition targets outside a sensible range')
  return { phases, nutrition, skipped }
}
