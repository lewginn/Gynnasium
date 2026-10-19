import { detectPRs, type PRType } from './prs'
import type { Equipment, SetLog } from './types'

export function workoutName(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'Morning workout'
  if (hour < 17) return 'Afternoon workout'
  return 'Evening workout'
}

/** 12:34, or 1:02:03 past the hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Rest countdown: 1:05, rounding up so it never shows 0:00 while time is left. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

type HistorySet = Pick<SetLog, 'sessionExerciseId' | 'completedAt' | 'setNumber'>

/** The sets from the most recent earlier session of an exercise, in order. */
export function lastSessionSets<T extends HistorySet>(history: T[]): T[] {
  if (history.length === 0) return []
  const latest = history.reduce((a, b) => (b.completedAt > a.completedAt ? b : a)).sessionExerciseId
  return history.filter((s) => s.sessionExerciseId === latest).sort((a, b) => a.setNumber - b.setNumber)
}

type Suggestion = Pick<SetLog, 'weightKg' | 'reps'>

/**
 * What to pre-fill for set `index` (0-based), so logging it is a single tap.
 * Follows last session's set, shifted by however much you've changed the weight today, so going
 * up 2.5kg on set 1 carries through and a pyramid keeps its shape. Past last session's sets, it
 * repeats the set just done.
 */
export function suggestSet(index: number, done: Suggestion[], previous: Suggestion[]): Suggestion | null {
  const target = previous[index]
  const last = done.at(-1)
  if (target) {
    const lastPlanned = previous[done.length - 1]
    const shift = last && lastPlanned ? last.weightKg - lastPlanned.weightKg : 0
    return { weightKg: Math.max(0, target.weightKg + shift), reps: target.reps }
  }
  const pick = last ?? previous.at(-1)
  return pick ? { weightKg: pick.weightKg, reps: pick.reps } : null
}

/** How many set rows to show: what's logged, at least what was done last time, and never fewer than 3. */
export function plannedSetCount(done: number, previous: number, extra = 0): number {
  return Math.max(done, previous, 3) + extra
}

type PRSet = Pick<SetLog, 'id' | 'exerciseId' | 'weightKg' | 'reps' | 'rpe' | 'setType' | 'completedAt'>

/**
 * PRs hit in a session, per set id. Each set is compared with all earlier sets of the same exercise,
 * including earlier sets this session. An exercise with no history before this session sets a
 * baseline, so a first session never shows PRs.
 */
export function sessionPRs(sets: PRSet[], historyByExercise: Map<string, PRSet[]>): Map<string, PRType[]> {
  const result = new Map<string, PRType[]>()
  const running = new Map<string, PRSet[]>()
  for (const set of [...sets].sort((a, b) => a.completedAt - b.completedAt)) {
    const history = historyByExercise.get(set.exerciseId) ?? []
    if (history.length === 0) continue
    const seen = running.get(set.exerciseId) ?? [...history]
    const prs = detectPRs(set, seen)
    if (prs.length > 0) result.set(set.id, prs)
    running.set(set.exerciseId, [...seen, set])
  }
  return result
}

export function sessionVolumeKg(sets: Pick<SetLog, 'weightKg' | 'reps' | 'setType'>[]): number {
  return sets.filter((s) => s.setType !== 'warmup').reduce((sum, s) => sum + s.weightKg * s.reps, 0)
}

/** Starting point for an exercise with no history: an empty Olympic bar, bodyweight, or a light load. */
export function defaultSet(equipment: Equipment | undefined): Pick<SetLog, 'weightKg' | 'reps'> {
  const weightKg = equipment === 'barbell' ? 20 : equipment === 'bodyweight' || equipment === 'band' ? 0 : 10
  return { weightKg, reps: 8 }
}
