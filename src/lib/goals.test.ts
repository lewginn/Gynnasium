import { describe, expect, it } from 'vitest'
import { countdown, countdownText, formatPace, targetProgress, type GoalData } from './goals'

const goal = { startsOn: '2026-10-01', targetDate: '2026-12-24' }
const weigh = (date: string, value: number) => ({ type: 'bodyweight' as const, date, value })
const data = (over: Partial<GoalData> = {}): GoalData => ({ metrics: [], lifts: new Map(), names: new Map(), ...over })

describe('targetProgress', () => {
  it('bodyweight: 7-day averages, the fraction done and the pace still needed', () => {
    const metrics = [weigh('2026-09-28', 86), weigh('2026-10-01', 84), weigh('2026-11-20', 81), weigh('2026-11-22', 81)]
    const p = targetProgress({ kind: 'bodyweight', value: 78 }, goal, data({ metrics }), '2026-11-26')
    expect(p.start).toBe(85) // average of the week up to the start
    expect(p.current).toBe(81)
    expect(p.direction).toBe('down')
    expect(p.done).toBe(false)
    expect(p.fraction).toBeCloseTo(4 / 7)
    expect(p.perWeek).toBeCloseTo(-3 / 4) // 3kg in 4 weeks
    expect(formatPace(p, 'kg')).toBe('0.75kg a week down')
  })

  it('lift: est. 1RM up towards the target, done once reached', () => {
    const lifts = new Map([['Bench', [{ date: '2026-09-30', e1rm: 90 }, { date: '2026-11-01', e1rm: 101 }]]])
    const p = targetProgress({ kind: 'lift', exerciseId: 'Bench', value: 100 }, goal, data({ lifts, names: new Map([['Bench', 'Bench Press']]) }), '2026-11-02')
    expect(p).toMatchObject({ label: 'Bench Press est. 1RM', start: 90, current: 101, direction: 'up', done: true, fraction: 1, perWeek: null })
  })

  it('measurement with nothing logged yet', () => {
    const p = targetProgress({ kind: 'measurement', metric: 'waist', value: 80 }, goal, data(), '2026-11-02')
    expect(p).toMatchObject({ label: 'Waist', unit: 'cm', start: null, current: null, done: false, fraction: null, perWeek: null })
  })
})

describe('countdown', () => {
  it('counts days and weeks to the date, and words it', () => {
    expect(countdown(goal, '2026-11-26')).toEqual({ daysLeft: 28, weeksLeft: 4, passed: false })
    expect(countdownText(countdown(goal, '2026-11-26'))).toBe('28 days to go')
    expect(countdownText(countdown(goal, '2026-12-23'))).toBe('Tomorrow')
    expect(countdownText(countdown(goal, '2026-12-24'))).toBe('Today')
    expect(countdownText(countdown(goal, '2027-01-14'))).toBe('3 weeks ago')
  })
})
