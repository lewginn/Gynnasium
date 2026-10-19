import { Decoder, Stream } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import { encodeWorkout, fitFileName, garminCategory, timeline, type FitExercise } from './fit'
import type { SetLog, WorkoutSession } from './types'

const T0 = Date.UTC(2026, 9, 19, 17, 0, 0)
const min = (m: number) => T0 + m * 60_000

const set = (n: number, reps: number, weightKg: number, completedAt?: number, durationSec?: number): SetLog => ({
  id: `s${n}-${completedAt}`,
  sessionExerciseId: 'se',
  exerciseId: 'x',
  setNumber: n,
  setType: 'working',
  weightKg,
  reps,
  durationSec,
  completedAt,
  updatedAt: 0,
})

const session: WorkoutSession = { id: 'w', name: 'Push · Week A', startedAt: T0, endedAt: min(30), updatedAt: 0 }
const exercises: FitExercise[] = [
  { exercise: { name: 'Barbell Bench Press - Medium Grip', logging: 'weight_reps', movementPattern: 'horizontal_push' }, sets: [set(1, 8, 80, min(3)), set(2, 6, 80, min(6)), set(3, 8, 80)] },
  { exercise: { name: 'Pullups', logging: 'bodyweight', movementPattern: 'vertical_pull' }, sets: [set(1, 10, 0, min(10)), set(2, 6, -20, min(13))] },
  { exercise: { name: 'Plank', logging: 'time', movementPattern: 'other' }, sets: [set(1, 0, 0, min(20), 60)] },
]

describe('garminCategory', () => {
  it('matches on the name first, then the movement pattern', () => {
    expect(garminCategory({ name: 'Barbell Bench Press - Medium Grip', movementPattern: 'horizontal_push' })).toBe('benchPress')
    expect(garminCategory({ name: 'Lying Leg Curls', movementPattern: 'isolation' })).toBe('legCurl')
    expect(garminCategory({ name: 'Dumbbell Bicep Curl', movementPattern: 'isolation' })).toBe('curl')
    expect(garminCategory({ name: 'Wide-Grip Lat Pulldown', movementPattern: 'vertical_pull' })).toBe('pullUp')
    expect(garminCategory({ name: 'Something Odd', movementPattern: 'hinge' })).toBe('deadlift')
    expect(garminCategory({ name: 'Something Odd', movementPattern: 'other' })).toBe('unknown')
  })
})

describe('timeline', () => {
  it('puts sets where they were ticked, with rest between, skipping sets never done', () => {
    const steps = timeline(session, exercises)
    expect(steps.map((s) => s.kind)).toEqual(['rest', 'active', 'rest', 'active', 'rest', 'active', 'rest', 'active', 'rest', 'active'])
    const first = steps[1]
    expect(first.end).toBe(min(3))
    expect((first.end - first.start) / 1000).toBe(32) // 8 reps × 4 s
    const plank = steps.at(-1)!
    expect((plank.end - plank.start) / 1000).toBe(60)
  })

  it('keeps moving forward when sets were ticked out of order', () => {
    const steps = timeline(session, [{ exercise: exercises[0].exercise, sets: [set(1, 5, 80, min(5)), set(2, 5, 80, min(5))] }])
    const active = steps.filter((s) => s.kind === 'active')
    expect(active[1].start).toBeGreaterThanOrEqual(active[0].end)
    expect(active[1].end).toBeGreaterThan(active[0].end)
  })
})

describe('encodeWorkout', () => {
  it('writes a valid strength-training activity that Garmin’s decoder reads back', () => {
    const bytes = encodeWorkout(session, exercises, 'kg')
    const decoder = new Decoder(Stream.fromByteArray(bytes))
    expect(decoder.isFIT()).toBe(true)
    expect(decoder.checkIntegrity()).toBe(true)
    const { messages, errors } = decoder.read()
    expect(errors).toEqual([])

    expect(messages.fileIdMesgs![0]).toMatchObject({ type: 'activity', manufacturer: 'development' })
    expect(messages.sessionMesgs![0]).toMatchObject({ sport: 'training', subSport: 'strengthTraining', totalElapsedTime: 1800 })
    expect(messages.activityMesgs![0]).toMatchObject({ numSessions: 1 })

    const active = messages.setMesgs!.filter((s) => s.setType === 'active')
    expect(active).toHaveLength(5)
    expect(active[0]).toMatchObject({ category: ['benchPress'], repetitions: 8, weight: 80, duration: 32 })
    expect(active[2]).toMatchObject({ category: ['pullUp'], repetitions: 10 })
    expect(active[2].weight).toBeUndefined() // bodyweight
    expect(active[3].weight).toBeUndefined() // assisted: no negative weight in FIT
    expect(active[4]).toMatchObject({ category: ['plank'], duration: 60 })
    expect(active[4].repetitions).toBeUndefined()
    expect(messages.setMesgs!.filter((s) => s.setType === 'rest').length).toBe(5)
  })

  it('names the file after the date and the workout', () => {
    expect(fitFileName({ startedAt: new Date(2026, 9, 19, 18).getTime(), name: 'Push · Week A' })).toBe('2026-10-19-push-week-a.fit')
  })
})
