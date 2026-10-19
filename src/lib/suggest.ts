import { MUSCLE_LABELS, PATTERN_LABELS } from './labels'
import { popularityRank } from './popular'
import type { Exercise, MovementPattern, Muscle } from './types'

const FOCUS_KEYWORDS: [RegExp, Muscle[]][] = [
  [/\bchest|\bpecs?\b/i, ['chest']],
  [/\bback\b/i, ['lats', 'upper_back']],
  [/\bpush\b/i, ['chest', 'shoulders', 'triceps']],
  [/\bpull\b/i, ['lats', 'upper_back', 'biceps']],
  [/\blegs?\b|\blower\b/i, ['quads', 'hamstrings', 'glutes', 'calves']],
  [/\bupper\b/i, ['chest', 'lats', 'upper_back', 'shoulders', 'biceps', 'triceps']],
  [/\bshoulders?\b|\bdelts?\b/i, ['shoulders']],
  [/\barms?\b/i, ['biceps', 'triceps']],
  [/\bbi(ceps|s)?\b/i, ['biceps']],
  [/\btri(ceps|s)?\b/i, ['triceps']],
  [/\bglutes?\b/i, ['glutes']],
  [/\bquads?\b/i, ['quads']],
  [/\bhamstrings?\b|\bhams\b/i, ['hamstrings']],
  [/\bcore\b|\babs\b/i, ['abs']],
  [/\bfull\s*body\b/i, ['chest', 'lats', 'upper_back', 'shoulders', 'quads', 'hamstrings', 'glutes']],
]

/** Guess which muscles a day targets from its name, e.g. "Back & Biceps" → lats, upper back, biceps. */
export function inferFocusMuscles(dayName: string): Muscle[] {
  const muscles = new Set<Muscle>()
  for (const [re, ms] of FOCUS_KEYWORDS) if (re.test(dayName)) ms.forEach((m) => muscles.add(m))
  return [...muscles]
}

const SUGGESTABLE_CATEGORIES = new Set(['strength', 'powerlifting'])

const STANDARD_EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight'])

export interface Suggestion {
  exercise: Exercise
  reason: string
}

/**
 * Exercises worth adding to a day that targets `focusMuscles`, given what's already on it.
 * Ranking: well-known staples first, compounds before isolations, and a bonus for movement
 * patterns or focus muscles the day doesn't cover yet (e.g. a row when the day only has pulldowns).
 */
export function suggestExercises(
  library: Exercise[],
  focusMuscles: Muscle[],
  current: Exercise[],
  limit = 8,
): Suggestion[] {
  if (focusMuscles.length === 0) return []
  const currentIds = new Set(current.map((e) => e.id))
  const candidates = library.filter(
    (e) =>
      !currentIds.has(e.id) &&
      SUGGESTABLE_CATEGORIES.has(e.category ?? 'strength') &&
      e.primaryMuscles.some((m) => focusMuscles.includes(m)),
  )

  const isNewPattern = (e: Exercise, covered: Set<MovementPattern>) =>
    e.mechanic === 'compound' && e.movementPattern !== 'other' && e.movementPattern !== 'isolation' && !covered.has(e.movementPattern)
  const newMuscle = (e: Exercise, covered: Set<Muscle>) => e.primaryMuscles.find((m) => focusMuscles.includes(m) && !covered.has(m))

  const score = (e: Exercise, patterns: Set<MovementPattern>, muscles: Set<Muscle>, dayLength: number) => {
    // Each earlier pick of the same movement (or, for isolations, the same muscle) makes another less useful.
    const isolationLike = (x: Exercise) => x.mechanic === 'isolation' || x.movementPattern === 'other'
    const repeats = picks.filter(({ exercise: p }) =>
      isolationLike(e)
        ? isolationLike(p) && p.primaryMuscles[0] === e.primaryMuscles[0]
        : p.movementPattern === e.movementPattern,
    ).length
    let s = -35 * repeats
    const rank = popularityRank(e.id)
    const popular = rank !== Infinity
    if (popular) s += 100 - rank * 0.5
    if (STANDARD_EQUIPMENT.has(e.equipment)) s += 10
    if (e.level === 'expert') s -= 10
    if (isNewPattern(e, patterns)) s += popular ? 40 : 15
    if (newMuscle(e, muscles)) s += 30
    // Compounds first on an empty day; once there are a few, isolations fill gaps.
    if (e.mechanic === 'compound') s += dayLength < 2 ? 25 : 5
    return s
  }

  // Pick greedily, treating each pick as already on the day, so the list covers different movements
  // instead of five variations of the same pulldown.
  const dayPatterns = new Set<MovementPattern>(current.map((e) => e.movementPattern))
  const dayMuscles = new Set<Muscle>(current.flatMap((e) => e.primaryMuscles))
  const patterns = new Set(dayPatterns)
  const muscles = new Set(dayMuscles)
  const remaining = [...candidates]
  const picks: Suggestion[] = []

  while (picks.length < limit && remaining.length > 0) {
    const dayLength = current.length + picks.length
    let best = 0
    let bestScore = -Infinity
    remaining.forEach((e, i) => {
      const s = score(e, patterns, muscles, dayLength)
      if (s > bestScore || (s === bestScore && e.name < remaining[best].name)) {
        best = i
        bestScore = s
      }
    })
    const [exercise] = remaining.splice(best, 1)

    // Reasons describe the gap on the actual day, not relative to other suggestions.
    const reasons: string[] = []
    if (isNewPattern(exercise, dayPatterns)) reasons.push(`Adds a ${PATTERN_LABELS[exercise.movementPattern].toLowerCase()}`)
    const missing = newMuscle(exercise, dayMuscles)
    if (missing) reasons.push(`No ${MUSCLE_LABELS[missing].toLowerCase()} work yet`)
    if (reasons.length === 0) reasons.push(exercise.mechanic === 'compound' ? 'Compound' : 'Isolation')
    picks.push({ exercise, reason: reasons.join(' · ') })

    patterns.add(exercise.movementPattern)
    exercise.primaryMuscles.forEach((m) => muscles.add(m))
  }
  return picks
}

/** Alternatives for a machine that's taken: same muscle, same movement first, popular first. */
export function swapSuggestions(library: Exercise[], exercise: Exercise, excludeIds: string[] = [], limit = 8): Exercise[] {
  const exclude = new Set([exercise.id, ...excludeIds])
  const primary = exercise.primaryMuscles[0]
  return library
    .filter((e) => !exclude.has(e.id) && e.primaryMuscles.includes(primary))
    .map((e) => {
      let score = 0
      if (e.movementPattern === exercise.movementPattern) score += 50
      if (e.mechanic === exercise.mechanic) score += 20
      const rank = popularityRank(e.id)
      if (rank !== Infinity) score += 60 - rank * 0.3
      if (STANDARD_EQUIPMENT.has(e.equipment)) score += 10
      if (e.equipment !== exercise.equipment) score += 5 // a different machine is the point of swapping
      return { e, score }
    })
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map(({ e }) => e)
}

/** Weekly working sets per muscle, counting primary muscles only. */
export function weeklySetsByMuscle(items: { exercise: Exercise; sets: number }[]): Map<Muscle, number> {
  const totals = new Map<Muscle, number>()
  for (const { exercise, sets } of items)
    for (const m of exercise.primaryMuscles) totals.set(m, (totals.get(m) ?? 0) + sets)
  return totals
}

/** Muscles most programmes should hit at least once a week. */
export const KEY_MUSCLES: Muscle[] = [
  'chest',
  'lats',
  'upper_back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
]

/** Sort library search results so well-known exercises come first. */
export function rankSearchResults(exercises: Exercise[]): Exercise[] {
  return [...exercises].sort((a, b) => popularityRank(a.id) - popularityRank(b.id) || a.name.localeCompare(b.name))
}
