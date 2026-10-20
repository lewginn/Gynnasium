import { describe, expect, it } from 'vitest'
import { suggestNext, weightIncrement, type ProgressionInput } from './progression'

const squat = { logging: 'weight_reps', equipment: 'barbell', mechanic: 'compound', region: 'lower' } as const
const bench = { logging: 'weight_reps', equipment: 'barbell', mechanic: 'compound', region: 'upper' } as const
const curl = { logging: 'weight_reps', equipment: 'dumbbell', mechanic: 'isolation', region: 'upper' } as const
const pullup = { logging: 'bodyweight', equipment: 'bodyweight', mechanic: 'compound', region: 'upper' } as const
const plank = { logging: 'time', equipment: 'bodyweight', mechanic: 'isolation', region: 'core' } as const

const sets = (kg: number, ...reps: number[]) => reps.map((r) => ({ weightKg: kg, reps: r }))
const input = (over: Partial<ProgressionInput>): ProgressionInput => ({
  history: [],
  target: { sets: 3, repMin: 8, repMax: 12 },
  exercise: bench,
  rule: 'double_progression',
  units: 'kg',
  ...over,
})

describe('weightIncrement', () => {
  it('suits the equipment and units', () => {
    expect(weightIncrement(squat, 'kg')).toBe(5)
    expect(weightIncrement(bench, 'kg')).toBe(2.5)
    expect(weightIncrement(curl, 'kg')).toBe(2)
    expect(weightIncrement(bench, 'lb')).toBe(5)
  })
})

describe('suggestNext: double progression', () => {
  it('first time: top of the range, no weight, nothing to say', () => {
    expect(suggestNext(input({}))).toEqual({ kind: 'start', sets: sets(0, 12, 12, 12), note: null })
  })

  it('adds a rep per set until the top of the range', () => {
    const p = suggestNext(input({ history: [sets(80, 10, 9, 8)] }))
    expect(p.kind).toBe('reps')
    expect(p.sets).toEqual(sets(80, 11, 10, 9))
    expect(p.note).toContain('one more rep')
  })

  it('adds weight and drops to the bottom of the range once every set hits the top', () => {
    const p = suggestNext(input({ history: [sets(80, 12, 12, 12)] }))
    expect(p).toMatchObject({ kind: 'increase', sets: sets(82.5, 8, 8, 8) })
    expect(p.note).toBe('Hit 12 on every set last time: up to 82.5kg.')
  })

  it('never suggests less than last time, even above the range', () => {
    expect(suggestNext(input({ history: [sets(80, 14, 11)] })).sets).toEqual(sets(80, 14, 12, 12))
  })

  it('needs every planned set: two good sets out of three is not enough', () => {
    expect(suggestNext(input({ history: [sets(80, 12, 12)] })).kind).toBe('reps')
  })

  it('jumps in round numbers in lb', () => {
    const p = suggestNext(input({ units: 'lb', history: [sets(100 * 0.45359237, 12, 12, 12)] }))
    expect(p.note).toBe('Hit 12 on every set last time: up to 105lb.')
  })

  it('drops about 10% after missing the range two workouts running', () => {
    const p = suggestNext(input({ exercise: squat, history: [sets(100, 6, 5, 5), sets(100, 7, 6, 5)] }))
    expect(p).toMatchObject({ kind: 'deload', sets: sets(90, 8, 8, 8) })
    expect(p.note).toContain('90kg')
  })

  it('one bad day is not a deload', () => {
    expect(suggestNext(input({ history: [sets(100, 6, 5, 5), sets(97.5, 9, 9, 8)] })).kind).toBe('reps')
  })
})

describe('suggestNext: other rules', () => {
  it('linear: more weight whenever every set hits the target', () => {
    const p = suggestNext(input({ rule: 'linear', exercise: squat, target: { sets: 5, repMin: 5, repMax: 5 }, history: [sets(100, 5, 5, 5, 5, 5)] }))
    expect(p).toMatchObject({ kind: 'increase', sets: sets(105, 5, 5, 5, 5, 5) })
  })

  it('linear: same again after a miss', () => {
    const p = suggestNext(input({ rule: 'linear', target: { sets: 3, repMin: 5, repMax: 5 }, history: [sets(100, 5, 5, 4)] }))
    expect(p).toMatchObject({ kind: 'repeat', sets: sets(100, 5, 5, 4) })
  })

  it('none: copies last time without comment', () => {
    expect(suggestNext(input({ rule: 'none', history: [sets(60, 10, 10, 10)] }))).toEqual({ kind: 'repeat', sets: sets(60, 10, 10, 10), note: null })
  })
})

describe('suggestNext: bodyweight and timed', () => {
  it('adds reps, then at the top suggests a harder version', () => {
    expect(suggestNext(input({ exercise: pullup, history: [sets(0, 8, 7, 6)] })).sets).toEqual(sets(0, 9, 8, 8))
    const top = suggestNext(input({ exercise: pullup, history: [sets(0, 12, 12, 12)] }))
    expect(top.kind).toBe('top')
    expect(top.note).toContain('harder variation')
  })

  it('takes away assistance once the top of the range is reached', () => {
    const p = suggestNext(input({ exercise: pullup, history: [sets(-20, 12, 12, 12)] }))
    expect(p.sets[0]).toEqual({ weightKg: -17.5, reps: 8 })
    expect(p.note).toContain('less assistance (17.5kg)')
  })

  it('timed: five seconds more per set, within the range', () => {
    const p = suggestNext(
      input({
        exercise: plank,
        target: { sets: 2, repMin: 30, repMax: 60 },
        history: [
          [
            { weightKg: 0, reps: 0, durationSec: 40 },
            { weightKg: 0, reps: 0, durationSec: 58 },
          ],
        ],
      }),
    )
    expect(p.sets).toEqual([
      { weightKg: 0, reps: 0, durationSec: 45 },
      { weightKg: 0, reps: 0, durationSec: 60 },
    ])
  })
})
