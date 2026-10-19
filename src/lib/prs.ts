import { estimate1RM } from './e1rm'
import type { SetLog } from './types'

export type PRType = 'max_weight' | 'max_e1rm' | 'max_reps_at_weight' | 'max_set_volume'

export const PR_LABELS: Record<PRType, string> = {
  max_weight: 'Heaviest weight',
  max_e1rm: 'Best est. 1RM',
  max_reps_at_weight: 'Rep PR',
  max_set_volume: 'Best set volume',
}

type SetLike = Pick<SetLog, 'weightKg' | 'reps' | 'rpe' | 'setType'>

const counts = (s: SetLike) => s.setType !== 'warmup' && s.reps > 0 && s.weightKg > 0

/**
 * Which PRs does `set` beat, compared with every earlier set of the same exercise?
 * The first ever set of an exercise sets a baseline rather than counting as a PR.
 */
export function detectPRs(set: SetLike, history: SetLike[]): PRType[] {
  if (!counts(set)) return []
  const previous = history.filter(counts)
  if (previous.length === 0) return []

  const prs: PRType[] = []

  if (set.weightKg > Math.max(...previous.map((s) => s.weightKg))) prs.push('max_weight')

  const e1rm = estimate1RM(set.weightKg, set.reps, set.rpe)
  const bestE1rm = Math.max(0, ...previous.map((s) => estimate1RM(s.weightKg, s.reps, s.rpe) ?? 0))
  if (e1rm !== null && e1rm > bestE1rm) prs.push('max_e1rm')

  // Rep PR: more reps than ever done at this weight or heavier (only meaningful if that weight has been lifted before).
  const atOrAbove = previous.filter((s) => s.weightKg >= set.weightKg)
  if (atOrAbove.length > 0 && set.reps > Math.max(...atOrAbove.map((s) => s.reps))) prs.push('max_reps_at_weight')

  if (set.weightKg * set.reps > Math.max(...previous.map((s) => s.weightKg * s.reps))) prs.push('max_set_volume')

  return prs
}
