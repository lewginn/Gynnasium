import { describe, expect, it } from 'vitest'
import type { Equipment, LoggingType, Units } from './types'
import { toDisplay, toKg } from './units'
import { barWeightKg, warmupSets, type WarmupInput } from './warmup'

const input = (over: Partial<WarmupInput> = {}): WarmupInput => ({
  workingWeightKg: 100,
  workingReps: 8,
  equipment: 'barbell',
  logging: 'weight_reps',
  units: 'kg',
  ...over,
})

/** The ramp as shown to the user: [weight in their units, reps]. */
const shown = (over: Partial<WarmupInput> = {}) => {
  const units: Units = over.units ?? 'kg'
  return warmupSets(input(over)).map((s) => [Number(toDisplay(s.weightKg, units).toFixed(6)), s.reps])
}

describe('warmupSets', () => {
  it('ramps a barbell lift: bar ×10, 40% ×8, 60% ×5, 80% ×3', () => {
    expect(shown({ workingWeightKg: 100 })).toEqual([
      [20, 10],
      [40, 8],
      [60, 5],
      [80, 3],
    ])
  })

  it('rounds to 2.5kg', () => {
    // 40% of 62.5 = 25, 60% = 37.5, 80% = 50
    expect(shown({ workingWeightKg: 62.5 })).toEqual([
      [20, 10],
      [25, 8],
      [37.5, 5],
      [50, 3],
    ])
    // 40% of 70 = 28 → 27.5, 60% = 42 → 42.5, 80% = 56 → 55
    expect(shown({ workingWeightKg: 70 })).toEqual([
      [20, 10],
      [27.5, 8],
      [42.5, 5],
      [55, 3],
    ])
  })

  it('rounds to 5lb and uses a 45lb bar when lifting in pounds', () => {
    expect(barWeightKg('lb')).toBeCloseTo(20.41, 2)
    expect(shown({ workingWeightKg: toKg(225, 'lb'), units: 'lb' })).toEqual([
      [45, 10],
      [90, 8],
      [135, 5],
      [180, 3],
    ])
    // 40% of 185 = 74 → 75, 60% = 111 → 110, 80% = 148 → 150
    expect(shown({ workingWeightKg: toKg(185, 'lb'), units: 'lb' })).toEqual([
      [45, 10],
      [75, 8],
      [110, 5],
      [150, 3],
    ])
  })

  it('stores kg', () => {
    expect(warmupSets(input({ workingWeightKg: toKg(225, 'lb'), units: 'lb' })).map((s) => s.weightKg)).toEqual(
      [45, 90, 135, 180].map((lb) => toKg(lb, 'lb')),
    )
    expect(warmupSets(input()).map((s) => s.weightKg)).toEqual([20, 40, 60, 80])
  })

  it('never goes below the bar, and drops steps that are no heavier than the one before', () => {
    // 40% of 40 = 16 and 60% = 24 → 25: 16 is lifted to the bar (dropped, same as the bar), 25 kept, 80% = 32 → 32.5
    expect(shown({ workingWeightKg: 40 })).toEqual([
      [20, 10],
      [25, 5],
      [32.5, 3],
    ])
    // 30kg: only the bar and 80% = 24 → 25 are between the bar and the working weight
    expect(shown({ workingWeightKg: 30 })).toEqual([
      [20, 10],
      [25, 3],
    ])
  })

  it('drops steps at or above the working weight', () => {
    // 22.5kg: 80% = 18 → the bar, which is already there
    expect(shown({ workingWeightKg: 22.5 })).toEqual([[20, 10]])
  })

  it('gives none for a lift at bar weight or lighter', () => {
    expect(shown({ workingWeightKg: 20 })).toEqual([])
    expect(shown({ workingWeightKg: 15 })).toEqual([])
    expect(shown({ workingWeightKg: toKg(45, 'lb'), units: 'lb' })).toEqual([])
  })

  it('ramps other equipment: 50% ×10, 75% ×5', () => {
    for (const equipment of ['dumbbell', 'cable', 'machine', 'kettlebell', 'band', 'other'] as Equipment[])
      expect(shown({ equipment, workingWeightKg: 40 })).toEqual([
        [20, 10],
        [30, 5],
      ])
    // 50% of 25 = 12.5, 75% = 18.75 → 20
    expect(shown({ equipment: 'machine', workingWeightKg: 25 })).toEqual([
      [12.5, 10],
      [20, 5],
    ])
    expect(shown({ equipment: 'cable', workingWeightKg: toKg(100, 'lb'), units: 'lb' })).toEqual([
      [50, 10],
      [75, 5],
    ])
  })

  it('gives light non-barbell lifts fewer sets, and none when nothing fits below the working weight', () => {
    // 50% of 5 = 2.5, 75% = 3.75 → 2.5 (same, dropped)
    expect(shown({ equipment: 'dumbbell', workingWeightKg: 5 })).toEqual([[2.5, 10]])
    // 50% of 2.5 = 1.25 → 0 or 2.5: never a set of nothing or of the working weight
    expect(shown({ equipment: 'dumbbell', workingWeightKg: 2.5 })).toEqual([])
  })

  it("keeps the heavier steps' reps at or below the working reps", () => {
    expect(shown({ workingWeightKg: 100, workingReps: 3 })).toEqual([
      [20, 10],
      [40, 8],
      [60, 3],
      [80, 3],
    ])
    expect(shown({ equipment: 'dumbbell', workingWeightKg: 40, workingReps: 4 })).toEqual([
      [20, 10],
      [30, 4],
    ])
  })

  it('gives none for bodyweight or timed exercises, or a working weight of 0', () => {
    expect(shown({ equipment: 'bodyweight' })).toEqual([])
    for (const logging of ['bodyweight', 'time'] as LoggingType[]) expect(shown({ logging })).toEqual([])
    expect(shown({ workingWeightKg: 0 })).toEqual([])
    expect(shown({ workingWeightKg: -10 })).toEqual([])
  })
})
