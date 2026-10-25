import type { Exercise, PlanExercise, SetLog, Units } from './types'
import { formatWeight, roundForDisplay, toDisplay, toKg } from './units'

// Progressive overload: what to aim for next time, from the last couple of times you did an exercise.
// Double progression (the default): keep the weight and add reps until every set reaches the top of the
// range, then add weight and start again from the bottom. Linear: add weight whenever every set hits the
// target. Either way, missing the range two workouts running drops the weight about 10%.

export type DoneSet = Pick<SetLog, 'weightKg' | 'reps' | 'durationSec'>

export interface ProgressionInput {
  /** Working sets from recent workouts of this exercise, newest workout first. */
  history: DoneSet[][]
  target: { sets: number; repMin: number; repMax: number }
  exercise: Pick<Exercise, 'logging' | 'equipment' | 'mechanic' | 'region'>
  rule: PlanExercise['progressionRule']
  units: Units
}

export interface PlannedSet {
  weightKg: number
  reps: number
  durationSec?: number
}

export interface Progression {
  kind: 'start' | 'repeat' | 'reps' | 'increase' | 'deload' | 'top'
  sets: PlannedSet[]
  /** One line for the workout screen, or null when there's nothing to say. */
  note: string | null
}

const TIME_STEP_SEC = 5

/** The smallest jump that makes sense for the equipment, in the user's units (kg or lb). */
export function weightIncrement(exercise: ProgressionInput['exercise'], units: Units): number {
  const kg = units === 'kg'
  switch (exercise.equipment) {
    case 'barbell':
      return exercise.region === 'lower' && exercise.mechanic === 'compound' ? (kg ? 5 : 10) : kg ? 2.5 : 5
    case 'dumbbell':
      return kg ? 2 : 5
    case 'kettlebell':
      return kg ? 4 : 10
    default:
      return kg ? 2.5 : 5
  }
}

/** Default target: reps for most exercises, seconds for timed ones. */
export function defaultRepRange(exercise: Pick<Exercise, 'mechanic' | 'logging'>): [number, number] {
  if (exercise.logging === 'time') return [30, 60]
  return exercise.mechanic === 'compound' ? [6, 10] : [10, 15]
}

/** Adds `steps` increments to a weight, landing on a number that's easy to load in the user's units. */
function step(weightKg: number, steps: number, inc: number, units: Units): number {
  const shown = roundForDisplay(toDisplay(weightKg, units), units)
  return toKg(shown + steps * inc, units)
}

function deload(weightKg: number, inc: number, units: Units): number {
  const shown = toDisplay(weightKg, units) * 0.9
  return toKg(Math.max(0, Math.round(shown / inc) * inc), units)
}

const pick = <T,>(list: T[], i: number) => list[Math.min(i, list.length - 1)]

export function suggestNext({ history, target, exercise, rule, units }: ProgressionInput): Progression {
  const [last, before] = history
  const timed = exercise.logging === 'time'
  const n = target.sets

  if (!last || last.length === 0)
    return {
      kind: 'start',
      sets: Array.from({ length: n }, () => (timed ? { weightKg: 0, reps: 0, durationSec: target.repMin } : { weightKg: 0, reps: target.repMax })),
      note: null,
    }

  const copy = (i: number): PlannedSet => {
    const s = pick(last, i)
    return timed ? { weightKg: s.weightKg, reps: 0, durationSec: s.durationSec ?? target.repMin } : { weightKg: s.weightKg, reps: s.reps }
  }
  if (rule === 'none') return { kind: 'repeat', sets: Array.from({ length: n }, (_, i) => copy(i)), note: null }

  const amount = (s: DoneSet) => (timed ? (s.durationSec ?? 0) : s.reps)
  const fullSets = last.length >= n
  const atTop = fullSets && last.every((s) => amount(s) >= target.repMax)
  const missed = (sets: DoneSet[] | undefined) => !!sets && sets.filter((s) => amount(s) < target.repMin).length > sets.length / 2
  const inc = weightIncrement(exercise, units)
  const top = Math.max(...last.map((s) => s.weightKg))

  // Bodyweight and timed: progress reps (or seconds) first; weight only if some is already in use.
  if (exercise.logging !== 'weight_reps') {
    const unit = timed ? TIME_STEP_SEC : 1
    if (atTop) {
      if (last.some((s) => s.weightKg !== 0) && exercise.equipment !== 'band') {
        const sets = Array.from({ length: n }, (_, i) => {
          const w = step(pick(last, i).weightKg, 1, inc, units)
          return timed ? { weightKg: w, reps: 0, durationSec: target.repMin } : { weightKg: w, reps: target.repMin }
        })
        const what = sets[0].weightKg < 0 ? `less assistance (${formatWeight(-sets[0].weightKg, units)})` : `+${formatWeight(sets[0].weightKg, units)}`
        return { kind: 'increase', sets, note: `Top of the range last time: ${what}.` }
      }
      return { kind: 'top', sets: Array.from({ length: n }, (_, i) => copy(i)), note: 'Top of the range: add weight or try a harder variation.' }
    }
    const sets = Array.from({ length: n }, (_, i) => {
      const s = pick(last, i)
      const next = amount(s) >= target.repMax ? amount(s) : Math.min(target.repMax, Math.max(target.repMin, amount(s) + unit))
      return timed ? { weightKg: s.weightKg, reps: 0, durationSec: next } : { weightKg: s.weightKg, reps: next }
    })
    return { kind: 'reps', sets, note: timed ? `Aim for ${TIME_STEP_SEC} seconds more per set.` : 'Aim for one more rep per set.' }
  }

  // Weight × reps.
  const success = rule === 'linear' ? fullSets && last.every((s) => s.reps >= target.repMin) : atTop
  if (success) {
    const sets = Array.from({ length: n }, (_, i) => ({ weightKg: step(pick(last, i).weightKg, 1, inc, units), reps: target.repMin }))
    const hit = rule === 'linear' ? `${target.repMin}+` : `${target.repMax}`
    return { kind: 'increase', sets, note: `Hit ${hit} on every set last time: up to ${formatWeight(sets[0].weightKg, units)}.` }
  }

  const beforeTop = before && before.length > 0 ? Math.max(...before.map((s) => s.weightKg)) : -1
  if (missed(last) && missed(before) && beforeTop >= top && top > 0) {
    const w = deload(top, inc, units)
    return {
      kind: 'deload',
      sets: Array.from({ length: n }, () => ({ weightKg: w, reps: target.repMin })),
      note: `Missed the rep range twice: ${formatWeight(w, units)} to build back up.`,
    }
  }

  if (rule === 'linear') return { kind: 'repeat', sets: Array.from({ length: n }, (_, i) => copy(i)), note: 'Same again: every set needs to hit the target.' }
  const sets = Array.from({ length: n }, (_, i) => {
    const s = pick(last, i)
    // Never less than last time, even above the range.
    return { weightKg: s.weightKg, reps: s.reps >= target.repMax ? s.reps : Math.max(target.repMin, s.reps + 1) }
  })
  return { kind: 'reps', sets, note: `Same weight, aim for one more rep per set (up to ${target.repMax}).` }
}
