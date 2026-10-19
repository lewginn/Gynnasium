// Converts free-exercise-db (public domain, https://github.com/yuhonas/free-exercise-db)
// into the compact library shipped with the app.
//
// Usage:
//   curl -o /tmp/exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
//   node scripts/build-exercises.mjs /tmp/exercises.json

import { readFileSync, writeFileSync } from 'node:fs'

const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/build-exercises.mjs <path-to-exercises.json>')
  process.exit(1)
}

const KEEP_CATEGORIES = new Set(['strength', 'powerlifting', 'olympic weightlifting', 'strongman'])

const MUSCLE = {
  abdominals: 'abs',
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lats',
  'lower back': 'lower_back',
  'middle back': 'upper_back',
  neck: 'neck',
  quadriceps: 'quads',
  shoulders: 'shoulders',
  traps: 'traps',
  triceps: 'triceps',
}

const REGION = {
  abs: 'core',
  lower_back: 'core',
  abductors: 'lower',
  adductors: 'lower',
  calves: 'lower',
  glutes: 'lower',
  hamstrings: 'lower',
  quads: 'lower',
}

const EQUIPMENT = {
  barbell: 'barbell',
  'e-z curl bar': 'barbell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
  'body only': 'bodyweight',
  kettlebells: 'kettlebell',
  bands: 'band',
  'medicine ball': 'other',
  'exercise ball': 'other',
  'foam roll': 'other',
  other: 'other',
}

// Order matters: first match wins.
const PATTERNS = [
  [/farmer|carry|yoke/i, 'carry'],
  [/lunge|split squat|step-?up|bulgarian/i, 'lunge'],
  [/squat|leg press|hack/i, 'squat'],
  [/deadlift|rdl|good morning|hip thrust|glute bridge|swing|pull[- ]through|hyperextension|clean|snatch/i, 'hinge'],
  [/pull-?up|chin-?up|pulldown|pull-down/i, 'vertical_pull'],
  [/row/i, 'horizontal_pull'],
  [/overhead|military|shoulder press|push press|arnold|jerk|handstand/i, 'vertical_push'],
  [/bench|push-?up|chest press|dip|floor press|(incline|decline).*press/i, 'horizontal_push'],
]

function movementPattern(ex) {
  for (const [re, pattern] of PATTERNS) if (re.test(ex.name)) return pattern
  return ex.mechanic === 'isolation' ? 'isolation' : 'other'
}

const raw = JSON.parse(readFileSync(input, 'utf8'))
const out = raw
  .filter((ex) => KEEP_CATEGORIES.has(ex.category))
  .map((ex) => {
    const primaryMuscles = ex.primaryMuscles.map((m) => MUSCLE[m]).filter(Boolean)
    const mechanic = ex.mechanic ?? 'compound'
    return {
      id: ex.id,
      name: ex.name,
      primaryMuscles,
      secondaryMuscles: ex.secondaryMuscles.map((m) => MUSCLE[m]).filter(Boolean),
      region: REGION[primaryMuscles[0]] ?? 'upper',
      movementPattern: movementPattern(ex),
      equipment: EQUIPMENT[ex.equipment] ?? 'other',
      mechanic,
      level: ex.level,
      category: ex.category,
      defaultRestSec: mechanic === 'compound' ? 150 : 90,
      image: ex.images[0] ?? null,
    }
  })
  .filter((ex) => ex.primaryMuscles.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name))

writeFileSync(new URL('../src/data/exercises.json', import.meta.url), JSON.stringify(out))
console.log(`Wrote ${out.length} exercises`)
