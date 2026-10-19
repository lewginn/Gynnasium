import { estimate1RM } from './e1rm'
import type { SetLog, Settings } from './types'
import { formatWeight } from './units'

/** "100kg × 5, 5, 3" or "100kg × 5 · 105kg × 3" when weights differ. Bodyweight sets show reps only. */
export function summariseSets(sets: SetLog[], settings: Pick<Settings, 'units'>): string {
  const groups: { weight: number; reps: number[] }[] = []
  for (const s of sets) {
    const g = groups.at(-1)
    if (g && g.weight === s.weightKg) g.reps.push(s.reps)
    else groups.push({ weight: s.weightKg, reps: [s.reps] })
  }
  return groups.map((g) => `${g.weight > 0 ? formatWeight(g.weight, settings.units) + ' × ' : ''}${g.reps.join(', ')}`).join(' · ')
}

export const countsForStats = (s: SetLog) => !!s.completedAt && s.setType !== 'warmup'

export function totalVolumeKg(sets: SetLog[]): number {
  return sets.filter(countsForStats).reduce((sum, s) => sum + s.weightKg * s.reps, 0)
}

export function bestE1RM(sets: SetLog[]): number | null {
  let best: number | null = null
  for (const s of sets.filter(countsForStats)) {
    const e = estimate1RM(s.weightKg, s.reps, s.rpe)
    if (e !== null && (best === null || e > best)) best = e
  }
  return best
}
