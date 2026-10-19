import type { Units } from './types'

export const KG_PER_LB = 0.45359237

export function toDisplay(weightKg: number, units: Units): number {
  return units === 'kg' ? weightKg : weightKg / KG_PER_LB
}

export function toKg(weight: number, units: Units): number {
  return units === 'kg' ? weight : weight * KG_PER_LB
}

/** Smallest sensible step for the weight steppers. */
export function weightStep(units: Units): number {
  return units === 'kg' ? 2.5 : 5
}

/** Rounds to the nearest 0.25kg / 0.5lb so conversions don't show 99.79kg. */
export function roundForDisplay(weight: number, units: Units): number {
  const step = units === 'kg' ? 0.25 : 0.5
  return Math.round(weight / step) * step
}

export function formatWeight(weightKg: number, units: Units): string {
  const value = roundForDisplay(toDisplay(weightKg, units), units)
  return `${Number(value.toFixed(2))}${units}`
}

/** Estimates (1RM, averages) to one decimal: "120.3kg". Not snapped to plate increments like real lifts. */
export function formatEstimate(weightKg: number, units: Units): string {
  return `${Number(toDisplay(weightKg, units).toFixed(1))}${units}`
}
