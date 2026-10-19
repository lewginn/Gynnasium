import { describe, expect, it } from 'vitest'
import { detectPRs } from './prs'
import type { SetType } from './types'

const set = (weightKg: number, reps: number, setType: SetType = 'working', rpe?: number) => ({ weightKg, reps, setType, rpe })

describe('detectPRs', () => {
  const history = [set(100, 5), set(100, 5), set(90, 8)]

  it('first ever set is a baseline, not a PR', () => {
    expect(detectPRs(set(100, 5), [])).toEqual([])
  })

  it('heavier weight is a weight and e1RM PR', () => {
    // 105 x 5 = 525kg doesn't beat 90 x 8 = 720kg, so no volume PR
    expect(detectPRs(set(105, 5), history)).toEqual(['max_weight', 'max_e1rm'])
  })

  it('more total weight moved in one set is a volume PR', () => {
    expect(detectPRs(set(90, 9), history)).toContain('max_set_volume')
  })

  it('more reps at a weight already lifted is a rep PR', () => {
    expect(detectPRs(set(100, 6), history)).toContain('max_reps_at_weight')
  })

  it('more reps at a lighter weight than ever lifted is not a rep PR on its own', () => {
    // 80kg was never lifted, but 90kg x 8 was; 9 reps @ 80 doesn't beat "reps at 80kg or heavier" (8)
    expect(detectPRs(set(80, 9), history)).toContain('max_reps_at_weight')
    expect(detectPRs(set(80, 8), history)).not.toContain('max_reps_at_weight')
  })

  it('matching a previous best is not a PR', () => {
    expect(detectPRs(set(100, 5), history)).toEqual([])
  })

  it('warm-ups never count, in history or as the new set', () => {
    expect(detectPRs(set(200, 1, 'warmup'), history)).toEqual([])
    expect(detectPRs(set(100, 5), [set(150, 5, 'warmup'), ...history])).toEqual([])
  })
})

describe('detectPRs for bodyweight and timed exercises', () => {
  const bw = (weightKg: number, reps: number) => ({ weightKg, reps, setType: 'working' as const })
  const timed = (weightKg: number, durationSec: number) => ({ weightKg, reps: 0, durationSec, setType: 'working' as const })

  it('bodyweight: more reps is a rep PR; no 1RM or volume PRs', () => {
    expect(detectPRs(bw(0, 12), [bw(0, 10)], 'bodyweight')).toEqual(['max_reps_at_weight'])
  })

  it('bodyweight: more added weight is a weight PR, and so is less assistance', () => {
    expect(detectPRs(bw(10, 5), [bw(0, 10), bw(5, 6)], 'bodyweight')).toContain('max_weight')
    expect(detectPRs(bw(-10, 8), [bw(-20, 8)], 'bodyweight')).toContain('max_weight')
  })

  it('bodyweight with no added weight ever: weight never counts', () => {
    expect(detectPRs(bw(0, 8), [bw(0, 10)], 'bodyweight')).toEqual([])
  })

  it('timed: holding longer is a PR; reps are ignored', () => {
    expect(detectPRs(timed(0, 75), [timed(0, 60)], 'time')).toEqual(['max_duration'])
    expect(detectPRs(timed(0, 60), [timed(0, 60)], 'time')).toEqual([])
  })

  it('timed with weight (carries): heavier or longer at that weight', () => {
    // First time at 40kg: heavier, but there's no earlier 40kg carry to beat on time.
    expect(detectPRs(timed(40, 30), [timed(32, 40)], 'time')).toEqual(['max_weight'])
    expect(detectPRs(timed(32, 45), [timed(32, 40), timed(40, 30)], 'time')).toEqual(['max_duration'])
  })
})
