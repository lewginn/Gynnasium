export type Muscle =
  | 'abs'
  | 'abductors'
  | 'adductors'
  | 'biceps'
  | 'calves'
  | 'chest'
  | 'forearms'
  | 'glutes'
  | 'hamstrings'
  | 'lats'
  | 'lower_back'
  | 'upper_back'
  | 'neck'
  | 'quads'
  | 'shoulders'
  | 'traps'
  | 'triceps'

export type Region = 'upper' | 'lower' | 'core'

export type MovementPattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'carry'
  | 'isolation'
  | 'other'

export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'kettlebell' | 'band' | 'other'

export type Units = 'kg' | 'lb'

/**
 * How sets of an exercise are logged:
 * - weight_reps: weight × reps (barbell, dumbbell, machine…)
 * - bodyweight: reps, with optional added weight (positive) or assistance (negative)
 * - time: seconds held or carried, with optional weight (plank, farmer's walk)
 */
export type LoggingType = 'weight_reps' | 'bodyweight' | 'time'

export interface Exercise {
  id: string
  name: string
  primaryMuscles: Muscle[]
  secondaryMuscles: Muscle[]
  region: Region
  movementPattern: MovementPattern
  equipment: Equipment
  logging: LoggingType
  mechanic: 'compound' | 'isolation'
  level: string
  /** strength | powerlifting | olympic weightlifting | strongman */
  category?: string
  defaultRestSec: number
  image: string | null
  isCustom?: boolean
}

/** Fields every user-owned, synced row carries. */
export interface Synced {
  id: string
  updatedAt: number
  deletedAt?: number
}

export interface Plan extends Synced {
  name: string
  goal?: string
  isActive: boolean
  createdBy: 'manual' | 'ai'
}

export interface PlanDay extends Synced {
  planId: string
  name: string
  order: number
  focusMuscles: Muscle[]
}

export interface PlanExercise extends Synced {
  planDayId: string
  exerciseId: string
  order: number
  supersetGroup?: string
  targetSets: number
  /** Target range: reps, or seconds for timed exercises. */
  repMin: number
  repMax: number
  targetRpe?: number
  restSec: number
  progressionRule: 'double_progression' | 'linear' | 'none'
  alternates: string[]
}

export interface WorkoutSession extends Synced {
  planDayId?: string
  name: string
  startedAt: number
  endedAt?: number
  notes?: string
}

export interface SessionExercise extends Synced {
  sessionId: string
  exerciseId: string
  order: number
  swappedFromExerciseId?: string
  notes?: string
}

export type SetType = 'warmup' | 'working' | 'drop' | 'failure'

export interface SetLog extends Synced {
  sessionExerciseId: string
  /** Denormalised so history and PR lookups don't need joins. */
  exerciseId: string
  setNumber: number
  setType: SetType
  /** Always stored in kg; converted for display. For bodyweight exercises it's the added weight (negative = assisted). */
  weightKg: number
  reps: number
  /** Seconds, for timed exercises. */
  durationSec?: number
  rpe?: number
  /** Unset while the set is planned but not yet done. Only completed sets count towards history and PRs. */
  completedAt?: number
  prs?: PRType[]
}

export type PRType = 'max_weight' | 'max_e1rm' | 'max_reps_at_weight' | 'max_set_volume' | 'max_duration'

export type BodyMetricType = 'bodyweight' | 'bodyfat' | 'waist' | 'chest' | 'arm' | 'thigh'

export interface BodyMetric extends Synced {
  type: BodyMetricType
  /** kg for bodyweight, % for bodyfat, cm for measurements. */
  value: number
  date: string
  source: 'manual' | 'garmin' | 'health'
}

export interface Settings {
  units: Units
  defaultRestSec: number
  showRpe: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'kg',
  defaultRestSec: 120,
  showRpe: false,
}
