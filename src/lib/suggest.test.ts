import { describe, expect, it } from 'vitest'
import libraryJson from '../data/exercises.json'
import { inferFocusMuscles, suggestExercises, swapSuggestions, weeklySetsByMuscle } from './suggest'
import type { Exercise } from './types'

const library = libraryJson as Exercise[]
const byId = (id: string) => library.find((e) => e.id === id)!

describe('inferFocusMuscles', () => {
  it('reads common day names', () => {
    expect(inferFocusMuscles('Back day')).toEqual(['lats', 'upper_back'])
    expect(inferFocusMuscles('Push A')).toEqual(['chest', 'shoulders', 'triceps'])
    expect(inferFocusMuscles('Legs')).toEqual(['quads', 'hamstrings', 'glutes', 'calves'])
    expect(inferFocusMuscles('Back & Biceps')).toEqual(['lats', 'upper_back', 'biceps'])
    expect(inferFocusMuscles('Day 1')).toEqual([])
  })

  it("doesn't match words inside other words", () => {
    expect(inferFocusMuscles('Pullover practice')).toEqual([])
    expect(inferFocusMuscles('Triathlon')).toEqual([])
  })
})

describe('suggestExercises', () => {
  it('suggests well-known back exercises for an empty back day', () => {
    const names = suggestExercises(library, ['lats', 'upper_back'], []).map((s) => s.exercise.id)
    expect(names.slice(0, 4)).toEqual(expect.arrayContaining(['Pullups', 'Bent_Over_Barbell_Row']))
    expect(names.every((id) => !id.includes('Chains') && !id.includes('Bands'))).toBe(true)
  })

  it('prefers a missing movement pattern', () => {
    const day = [byId('Wide-Grip_Lat_Pulldown'), byId('Pullups')]
    const [first] = suggestExercises(library, ['lats', 'upper_back'], day)
    expect(first.exercise.movementPattern).toBe('horizontal_pull')
    expect(first.reason).toMatch(/horizontal pull/i)
  })

  it('never suggests what is already on the day', () => {
    const day = [byId('Pullups')]
    expect(suggestExercises(library, ['lats'], day, 50).some((s) => s.exercise.id === 'Pullups')).toBe(false)
  })

  it('returns nothing without a focus', () => {
    expect(suggestExercises(library, [], [])).toEqual([])
  })
})

describe('swapSuggestions', () => {
  it('offers hamstring alternatives for a lying leg curl', () => {
    const alts = swapSuggestions(library, byId('Lying_Leg_Curls'))
    expect(alts[0].primaryMuscles).toContain('hamstrings')
    expect(alts.map((e) => e.id)).toContain('Seated_Leg_Curl')
    expect(alts.map((e) => e.id)).not.toContain('Lying_Leg_Curls')
  })
})

describe('weeklySetsByMuscle', () => {
  it('sums sets per primary muscle', () => {
    const totals = weeklySetsByMuscle([
      { exercise: byId('Pullups'), sets: 4 },
      { exercise: byId('Wide-Grip_Lat_Pulldown'), sets: 3 },
      { exercise: byId('Barbell_Curl'), sets: 3 },
    ])
    expect(totals.get('lats')).toBe(7)
    expect(totals.get('biceps')).toBe(3)
  })
})
