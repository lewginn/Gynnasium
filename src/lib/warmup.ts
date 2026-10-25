import type { Equipment, LoggingType, SetLog, Units } from './types'
import { toDisplay, toKg } from './units'

// The warm-up set: one lighter set before the first working set, added with one tap.
// Half the working weight × 10, on what you can load (2.5kg or 5lb). A barbell never goes below
// the empty bar, or above the working weight. Works at any weight, including none yet.

export interface WarmupSet {
  weightKg: number
  reps: number
}

export interface WarmupInput {
  /** The first working set's weight. */
  workingWeightKg: number
  equipment: Equipment
  logging: LoggingType
  units: Units
}

/** The empty bar: 20kg, or 45lb when you lift in pounds. */
const BAR: Record<Units, number> = { kg: 20, lb: 45 }

/** Plates go on in 2.5kg or 5lb steps. */
const LOAD_STEP: Record<Units, number> = { kg: 2.5, lb: 5 }

const SHARE = 0.5
const REPS = 10

/** Exercises logged with a weight get a warm-up; bodyweight and timed ones don't. */
export function hasWarmup(equipment: Equipment, logging: LoggingType): boolean {
  return logging === 'weight_reps' && equipment !== 'bodyweight'
}

export function warmupSet({ workingWeightKg, equipment, logging, units }: WarmupInput): WarmupSet | null {
  if (!hasWarmup(equipment, logging)) return null
  const inc = LOAD_STEP[units]
  const working = Math.max(0, toDisplay(workingWeightKg, units))
  let weight = Math.round((working * SHARE) / inc) * inc
  if (equipment === 'barbell') weight = Math.max(weight, Math.min(BAR[units], working))
  return { weightKg: toKg(weight, units), reps: REPS }
}

/** The warm-up can be added while an exercise has none yet and none of its sets has been done. */
export function canAddWarmups(sets: Pick<SetLog, 'setType' | 'completedAt'>[]): boolean {
  return !sets.some((s) => s.setType === 'warmup' || !!s.completedAt)
}
