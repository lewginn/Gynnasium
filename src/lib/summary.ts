import { estimate1RM } from './e1rm'
import { formatClock } from './format'
import type { LoggingType, SetLog, Settings } from './types'
import { formatWeight } from './units'

/** 45 → "45s", 90 → "90s", 150 → "2:30". Seconds read better for typical holds. */
export function formatSeconds(sec: number): string {
  return sec < 120 ? `${sec}s` : formatClock(sec)
}

/** Added weight on a bodyweight exercise: "BW", "+10kg" or "−20kg" (assisted). */
export function formatAddedWeight(weightKg: number, settings: Pick<Settings, 'units'>): string {
  if (weightKg === 0) return 'BW'
  return `${weightKg > 0 ? '+' : '−'}${formatWeight(Math.abs(weightKg), settings.units)}`
}

/**
 * One line per exercise for history and summaries, grouping consecutive sets at the same weight:
 * "100kg × 5, 5, 3" · "BW × 12, 10" · "+10kg × 8" · "60s, 45s" · "32kg × 40s".
 */
export function summariseSets(sets: SetLog[], settings: Pick<Settings, 'units'>, logging: LoggingType = 'weight_reps'): string {
  const groups: { weight: number; values: number[] }[] = []
  for (const s of sets) {
    const value = logging === 'time' ? (s.durationSec ?? 0) : s.reps
    const g = groups.at(-1)
    if (g && g.weight === s.weightKg) g.values.push(value)
    else groups.push({ weight: s.weightKg, values: [value] })
  }
  return groups
    .map(({ weight, values }) => {
      if (logging === 'time') {
        const times = values.map(formatSeconds).join(', ')
        return weight > 0 ? `${formatWeight(weight, settings.units)} × ${times}` : times
      }
      const reps = values.join(', ')
      if (logging === 'bodyweight') return `${formatAddedWeight(weight, settings)} × ${reps}`
      return weight > 0 ? `${formatWeight(weight, settings.units)} × ${reps}` : reps
    })
    .join(' · ')
}

/** A single set: "82.5kg × 8", "BW × 12", "+10kg × 6", "60s" or "32kg × 40s". */
export function formatSet(set: SetLog, settings: Pick<Settings, 'units'>, logging: LoggingType): string {
  return summariseSets([set], settings, logging)
}

export const countsForStats = (s: SetLog) => !!s.completedAt && s.setType !== 'warmup'

/** Total weight moved (kg × reps). Pass weight × reps sets only; bodyweight and timed sets aren't comparable. */
export function totalVolumeKg(sets: SetLog[]): number {
  return sets.filter(countsForStats).reduce((sum, s) => sum + Math.max(0, s.weightKg) * s.reps, 0)
}

export function bestE1RM(sets: SetLog[]): number | null {
  let best: number | null = null
  for (const s of sets.filter(countsForStats)) {
    const e = estimate1RM(s.weightKg, s.reps, s.rpe)
    if (e !== null && (best === null || e > best)) best = e
  }
  return best
}

/** The set to quote as "last time": heaviest, then most reps, then longest. */
export function bestSet(sets: SetLog[]): SetLog | undefined {
  const key = (s: SetLog) => [s.weightKg, s.reps, s.durationSec ?? 0]
  return sets.reduce<SetLog | undefined>((best, s) => {
    if (!best) return s
    const [a, b] = [key(s), key(best)]
    const i = a.findIndex((v, j) => v !== b[j])
    return i >= 0 && a[i] > b[i] ? s : best
  }, undefined)
}
