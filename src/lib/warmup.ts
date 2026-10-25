import type { Equipment, LoggingType, SetLog, Units } from './types'
import { toDisplay, toKg } from './units'

// Warm-up sets: a ramp of lighter sets before the first working set, added with one tap.
// Barbell: the empty bar, then 40%, 60% and 80% of the working weight. Anything else: 50% and 75%.
// Weights land on what you can load (2.5kg or 5lb) and every step is heavier than the one before
// and lighter than the working weight, so light lifts get fewer sets and a lift at bar weight gets none.

export interface WarmupSet {
  weightKg: number
  reps: number
}

export interface WarmupInput {
  /** The first working set's weight. */
  workingWeightKg: number
  /** The first working set's reps. */
  workingReps: number
  equipment: Equipment
  logging: LoggingType
  units: Units
}

/** The empty bar: 20kg, or 45lb when you lift in pounds. */
const BAR: Record<Units, number> = { kg: 20, lb: 45 }

export function barWeightKg(units: Units): number {
  return toKg(BAR[units], units)
}

/** Plates go on in 2.5kg or 5lb steps. */
const LOAD_STEP: Record<Units, number> = { kg: 2.5, lb: 5 }

type Step = { pct: number; reps: number }
const BARBELL: Step[] = [
  { pct: 0, reps: 10 }, // the bar
  { pct: 0.4, reps: 8 },
  { pct: 0.6, reps: 5 },
  { pct: 0.8, reps: 3 },
]
const OTHER: Step[] = [
  { pct: 0.5, reps: 10 },
  { pct: 0.75, reps: 5 },
]

/** Steps at 60% and up never ask for more reps than the working set, so they don't tire you before it. */
const HEAVY = 0.6

// Comparisons are in display units, where loads are exact multiples of the step (no kg↔lb float noise).
const EPS = 1e-6

export function warmupSets({ workingWeightKg, workingReps, equipment, logging, units }: WarmupInput): WarmupSet[] {
  if (logging !== 'weight_reps' || equipment === 'bodyweight' || !(workingWeightKg > 0)) return []

  const inc = LOAD_STEP[units]
  const working = toDisplay(workingWeightKg, units)
  const barbell = equipment === 'barbell'
  const bar = BAR[units]

  const out: WarmupSet[] = []
  let previous = 0
  for (const { pct, reps } of barbell ? BARBELL : OTHER) {
    let weight = pct === 0 ? bar : Math.round((working * pct) / inc) * inc
    if (barbell) weight = Math.max(bar, weight)
    if (weight <= previous + EPS || weight >= working - EPS) continue
    previous = weight
    out.push({ weightKg: toKg(weight, units), reps: pct >= HEAVY && workingReps > 0 ? Math.min(reps, workingReps) : reps })
  }
  return out
}

/** Warm-ups can be added while an exercise has none yet and none of its sets has been done. */
export function canAddWarmups(sets: Pick<SetLog, 'setType' | 'completedAt'>[]): boolean {
  return !sets.some((s) => s.setType === 'warmup' || !!s.completedAt)
}
