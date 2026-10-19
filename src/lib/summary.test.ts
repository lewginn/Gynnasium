import { describe, expect, it } from 'vitest'
import { formatAddedWeight, formatDuration, summariseSets, totalVolumeKg } from './summary'
import type { SetLog } from './types'

const set = (weightKg: number, reps: number, durationSec?: number): SetLog => ({
  id: `${weightKg}-${reps}-${durationSec}`,
  sessionExerciseId: 'se',
  exerciseId: 'ex',
  setNumber: 1,
  setType: 'working',
  weightKg,
  reps,
  durationSec,
  completedAt: 1,
  updatedAt: 1,
})
const kg = { units: 'kg' as const }

describe('summariseSets', () => {
  it('weight × reps, grouped by weight', () => {
    expect(summariseSets([set(100, 5), set(100, 5), set(105, 3)], kg)).toBe('100kg × 5, 5 · 105kg × 3')
  })

  it('bodyweight shows BW, added or assisted weight', () => {
    expect(summariseSets([set(0, 12), set(0, 10)], kg, 'bodyweight')).toBe('BW × 12, 10')
    expect(summariseSets([set(10, 6)], kg, 'bodyweight')).toBe('+10kg × 6')
    expect(summariseSets([set(-20, 8)], kg, 'bodyweight')).toBe('−20kg × 8')
  })

  it('timed shows durations, with weight for carries', () => {
    expect(summariseSets([set(0, 0, 60), set(0, 0, 45)], kg, 'time')).toBe('60s, 45s')
    expect(summariseSets([set(32, 0, 90)], kg, 'time')).toBe('32kg × 90s')
    expect(summariseSets([set(0, 0, 150)], kg, 'time')).toBe('2:30')
  })
})

describe('helpers', () => {
  it('formats durations and added weight', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(125)).toBe('2:05')
    expect(formatAddedWeight(0, kg)).toBe('BW')
    expect(formatAddedWeight(5, { units: 'lb' })).toBe('+11lb')
  })

  it('volume ignores negative (assisted) weight', () => {
    expect(totalVolumeKg([set(100, 5), set(-20, 10)])).toBe(500)
  })
})
