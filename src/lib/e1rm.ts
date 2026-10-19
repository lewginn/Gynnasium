/** Above this many reps the estimate is too unreliable to count. */
export const MAX_REPS_FOR_E1RM = 12

export function epley(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

export function brzycki(weight: number, reps: number): number {
  return reps === 1 ? weight : (weight * 36) / (37 - reps)
}

/**
 * Estimated one-rep max: the average of Epley and Brzycki.
 * With an RPE, reps left in the tank (10 - RPE) are added, so a set of 5 @ RPE 8 is treated like 7 to failure.
 * Returns null when the set can't give a meaningful estimate.
 */
export function estimate1RM(weight: number, reps: number, rpe?: number): number | null {
  if (weight <= 0 || reps < 1) return null
  const effectiveReps = rpe !== undefined ? reps + Math.max(0, 10 - rpe) : reps
  if (effectiveReps > MAX_REPS_FOR_E1RM) return null
  return (epley(weight, effectiveReps) + brzycki(weight, effectiveReps)) / 2
}
