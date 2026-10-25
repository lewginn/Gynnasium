import { describe, expect, it } from 'vitest'
import type { Equipment, LoggingType, Units } from './types'
import { toDisplay, toKg } from './units'
import { canAddWarmups, warmupSet, type WarmupInput } from './warmup'

const input = (over: Partial<WarmupInput> = {}): WarmupInput => ({
  workingWeightKg: 100,
  equipment: 'barbell',
  logging: 'weight_reps',
  units: 'kg',
  ...over,
})

/** The warm-up as shown to the user: [weight in their units, reps]. */
const shown = (over: Partial<WarmupInput> = {}) => {
  const units: Units = over.units ?? 'kg'
  const set = warmupSet(input(over))
  return set && [Number(toDisplay(set.weightKg, units).toFixed(6)), set.reps]
}

describe('warmupSet', () => {
  it('is half the working weight × 10', () => {
    expect(shown({ workingWeightKg: 100 })).toEqual([50, 10])
    expect(shown({ equipment: 'dumbbell', workingWeightKg: 30 })).toEqual([15, 10])
  })

  it('rounds to 2.5kg, or 5lb when lifting in pounds, and stores kg', () => {
    // 50% of 65 = 32.5, of 67.5 = 33.75 → 35
    expect(shown({ workingWeightKg: 65 })).toEqual([32.5, 10])
    expect(shown({ workingWeightKg: 67.5 })).toEqual([35, 10])
    // 50% of 185lb = 92.5 → 95
    expect(shown({ workingWeightKg: toKg(185, 'lb'), units: 'lb' })).toEqual([95, 10])
    expect(warmupSet(input({ workingWeightKg: toKg(185, 'lb'), units: 'lb' }))!.weightKg).toBe(toKg(95, 'lb'))
  })

  it('never puts a barbell below the empty bar, or above the working weight', () => {
    expect(shown({ workingWeightKg: 30 })).toEqual([20, 10])
    expect(shown({ workingWeightKg: 22.5 })).toEqual([20, 10])
    expect(shown({ workingWeightKg: 20 })).toEqual([20, 10])
    // A lighter bar: the warm-up is the working weight, never half a bar.
    expect(shown({ workingWeightKg: 15 })).toEqual([15, 10])
    expect(shown({ workingWeightKg: toKg(65, 'lb'), units: 'lb' })).toEqual([45, 10])
  })

  it('works at any weight, including none yet', () => {
    expect(shown({ equipment: 'dumbbell', workingWeightKg: 2.5 })).toEqual([2.5, 10])
    expect(shown({ equipment: 'machine', workingWeightKg: 0 })).toEqual([0, 10])
    expect(shown({ workingWeightKg: 0 })).toEqual([0, 10])
    expect(shown({ workingWeightKg: -10 })).toEqual([0, 10])
  })

  it('is the same for every non-barbell equipment', () => {
    for (const equipment of ['dumbbell', 'cable', 'machine', 'kettlebell', 'band', 'other'] as Equipment[])
      expect(shown({ equipment, workingWeightKg: 15 })).toEqual([7.5, 10])
  })

  it('gives none for bodyweight or timed exercises', () => {
    expect(shown({ equipment: 'bodyweight' })).toBeNull()
    for (const logging of ['bodyweight', 'time'] as LoggingType[]) expect(shown({ logging })).toBeNull()
  })
})

describe('canAddWarmups', () => {
  it('only until the exercise has a warm-up or a done set', () => {
    expect(canAddWarmups([{ setType: 'working' }, { setType: 'working' }])).toBe(true)
    expect(canAddWarmups([{ setType: 'warmup' }, { setType: 'working' }])).toBe(false)
    expect(canAddWarmups([{ setType: 'working' }, { setType: 'working', completedAt: 1 }])).toBe(false)
  })
})
