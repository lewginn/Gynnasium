import type { Equipment, MovementPattern, Muscle, Region } from './types'

export const MUSCLE_LABELS: Record<Muscle, string> = {
  abs: 'Abs',
  abductors: 'Abductors',
  adductors: 'Adductors',
  biceps: 'Biceps',
  calves: 'Calves',
  chest: 'Chest',
  forearms: 'Forearms',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  lats: 'Lats',
  lower_back: 'Lower back',
  upper_back: 'Upper back',
  neck: 'Neck',
  quads: 'Quads',
  shoulders: 'Shoulders',
  traps: 'Traps',
  triceps: 'Triceps',
}

export const REGION_LABELS: Record<Region, string> = {
  upper: 'Upper body',
  lower: 'Lower body',
  core: 'Core',
}

export const MUSCLES_BY_REGION: Record<Region, Muscle[]> = {
  upper: ['chest', 'shoulders', 'lats', 'upper_back', 'traps', 'biceps', 'triceps', 'forearms', 'neck'],
  lower: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  core: ['abs', 'lower_back'],
}

export const PATTERN_LABELS: Record<MovementPattern, string> = {
  horizontal_push: 'Horizontal push',
  vertical_push: 'Vertical push',
  horizontal_pull: 'Horizontal pull',
  vertical_pull: 'Vertical pull',
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Lunge',
  carry: 'Carry',
  isolation: 'Isolation',
  other: 'Other',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
  other: 'Other',
}
