import { estimate1RM } from './e1rm'
import type { LoggingType, PRType, SetLog } from './types'

export const PR_LABELS: Record<PRType, string> = {
  max_weight: 'Heaviest weight',
  max_e1rm: 'Best est. 1RM',
  max_reps_at_weight: 'Rep PR',
  max_set_volume: 'Best set volume',
  max_duration: 'Longest time',
}

type SetLike = Pick<SetLog, 'weightKg' | 'reps' | 'rpe' | 'setType' | 'durationSec'>

function counts(s: SetLike, logging: LoggingType): boolean {
  if (s.setType === 'warmup') return false
  if (logging === 'time') return (s.durationSec ?? 0) > 0
  if (logging === 'bodyweight') return s.reps > 0
  return s.reps > 0 && s.weightKg > 0
}

const max = (values: number[]) => Math.max(-Infinity, ...values)

/**
 * Which PRs does `set` beat, compared with every earlier set of the same exercise?
 * The first ever set of an exercise sets a baseline rather than counting as a PR.
 */
export function detectPRs(set: SetLike, history: SetLike[], logging: LoggingType = 'weight_reps'): PRType[] {
  if (!counts(set, logging)) return []
  const previous = history.filter((s) => counts(s, logging))
  if (previous.length === 0) return []

  const prs: PRType[] = []
  const atOrAbove = previous.filter((s) => s.weightKg >= set.weightKg)

  // For bodyweight and timed exercises, only added weight counts (less assistance on a negative weight counts too).
  const weightMatters = logging === 'weight_reps' || set.weightKg !== 0 || previous.some((s) => s.weightKg !== 0)
  if (weightMatters && set.weightKg > max(previous.map((s) => s.weightKg))) prs.push('max_weight')

  if (logging === 'weight_reps') {
    const e1rm = estimate1RM(set.weightKg, set.reps, set.rpe)
    const bestE1rm = Math.max(0, ...previous.map((s) => estimate1RM(s.weightKg, s.reps, s.rpe) ?? 0))
    if (e1rm !== null && e1rm > bestE1rm) prs.push('max_e1rm')
  }

  if (logging === 'time') {
    // Longest time at this weight or heavier.
    if (atOrAbove.length > 0 && (set.durationSec ?? 0) > max(atOrAbove.map((s) => s.durationSec ?? 0))) prs.push('max_duration')
    return prs
  }

  // Rep PR: more reps than ever done at this weight or heavier (only meaningful if that weight has been lifted before).
  if (atOrAbove.length > 0 && set.reps > max(atOrAbove.map((s) => s.reps))) prs.push('max_reps_at_weight')

  if (logging === 'weight_reps' && set.weightKg * set.reps > max(previous.map((s) => s.weightKg * s.reps))) prs.push('max_set_volume')

  return prs
}
