import { describe, expect, it } from 'vitest'
import type { SetLog } from './types'
import {
  defaultSet,
  formatCountdown,
  formatDuration,
  lastSessionSets,
  plannedSetCount,
  sessionPRs,
  sessionVolumeKg,
  suggestSet,
  workoutName,
} from './workout'

const log = (id: string, sessionExerciseId: string, setNumber: number, weightKg: number, reps: number, completedAt: number): SetLog => ({
  id,
  sessionExerciseId,
  exerciseId: 'bench',
  setNumber,
  setType: 'working',
  weightKg,
  reps,
  completedAt,
  updatedAt: completedAt,
})

describe('workoutName', () => {
  it('names by time of day', () => {
    expect(workoutName(new Date(2026, 0, 1, 7))).toBe('Morning workout')
    expect(workoutName(new Date(2026, 0, 1, 13))).toBe('Afternoon workout')
    expect(workoutName(new Date(2026, 0, 1, 19))).toBe('Evening workout')
  })
})

describe('formatting', () => {
  it('formats elapsed time', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(3_723_000)).toBe('1:02:03')
  })

  it('rounds countdowns up so time left never shows as 0:00', () => {
    expect(formatCountdown(500)).toBe('0:01')
    expect(formatCountdown(90_000)).toBe('1:30')
    expect(formatCountdown(-3000)).toBe('0:00')
  })
})

describe('lastSessionSets', () => {
  it('returns the most recent session, in set order', () => {
    const history = [log('a', 'old', 1, 60, 8, 1), log('c', 'new', 2, 65, 7, 11), log('b', 'new', 1, 65, 8, 10)]
    expect(lastSessionSets(history).map((s) => s.id)).toEqual(['b', 'c'])
    expect(lastSessionSets([])).toEqual([])
  })
})

describe('suggestSet', () => {
  const previous = [
    { weightKg: 80, reps: 8 },
    { weightKg: 80, reps: 7 },
  ]

  it('repeats last session’s set when nothing has changed', () => {
    expect(suggestSet(0, [], previous)).toEqual({ weightKg: 80, reps: 8 })
    expect(suggestSet(1, [{ weightKg: 80, reps: 8 }], previous)).toEqual({ weightKg: 80, reps: 7 })
  })

  it('carries a weight change forward', () => {
    expect(suggestSet(1, [{ weightKg: 82.5, reps: 8 }], previous)).toEqual({ weightKg: 82.5, reps: 7 })
  })

  it('keeps a pyramid’s shape', () => {
    const pyramid = [
      { weightKg: 60, reps: 10 },
      { weightKg: 70, reps: 8 },
      { weightKg: 80, reps: 6 },
    ]
    expect(suggestSet(1, [{ weightKg: 62.5, reps: 10 }], pyramid)).toEqual({ weightKg: 72.5, reps: 8 })
    expect(suggestSet(2, [{ weightKg: 62.5, reps: 10 }], pyramid)).toEqual({ weightKg: 82.5, reps: 6 })
  })

  it('repeats the set just done once past last session’s sets', () => {
    expect(suggestSet(2, [{ weightKg: 85, reps: 5 }], previous)).toEqual({ weightKg: 85, reps: 5 })
    expect(suggestSet(2, [], previous)).toEqual({ weightKg: 80, reps: 7 })
  })

  it('has nothing to suggest for a new exercise', () => {
    expect(suggestSet(0, [], [])).toBeNull()
  })
})

describe('plannedSetCount', () => {
  it('shows at least 3 rows, last session’s count, or what is logged', () => {
    expect(plannedSetCount(0, 0)).toBe(3)
    expect(plannedSetCount(1, 5)).toBe(5)
    expect(plannedSetCount(6, 4, 1)).toBe(7)
  })
})

describe('sessionPRs', () => {
  const history = new Map([['bench', [log('h1', 'old', 1, 80, 8, 1)]]])

  it('flags sets that beat earlier ones, including earlier sets this session', () => {
    const sets = [log('s2', 'now', 2, 85, 8, 20), log('s1', 'now', 1, 82.5, 8, 10), log('s3', 'now', 3, 82.5, 8, 30)]
    const prs = sessionPRs(sets, history)
    expect(prs.get('s1')).toContain('max_weight')
    expect(prs.get('s2')).toContain('max_weight')
    expect(prs.has('s3')).toBe(false) // 82.5 no longer beats the 85 just lifted
  })

  it('treats a first session as the baseline', () => {
    const sets = [log('s1', 'now', 1, 60, 8, 10), log('s2', 'now', 2, 70, 8, 20)]
    expect(sessionPRs(sets, new Map()).size).toBe(0)
  })
})

describe('sessionVolumeKg', () => {
  it('sums weight × reps, ignoring warm-ups', () => {
    expect(
      sessionVolumeKg([
        { weightKg: 100, reps: 5, setType: 'working' },
        { weightKg: 40, reps: 10, setType: 'warmup' },
        { weightKg: 90, reps: 8, setType: 'working' },
      ]),
    ).toBe(1220)
  })
})

describe('defaultSet', () => {
  it('starts barbells at the empty bar and bodyweight at zero', () => {
    expect(defaultSet('barbell')).toEqual({ weightKg: 20, reps: 8 })
    expect(defaultSet('bodyweight').weightKg).toBe(0)
    expect(defaultSet('dumbbell').weightKg).toBe(10)
  })
})
