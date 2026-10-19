import { describe, expect, it } from 'vitest'
import { change, dailyValues, fromDateKey, movingAverage, niceTicks, toDateKey, weekStart, weeklyCounts } from './metrics'

describe('dates', () => {
  it('round-trips date keys', () => {
    expect(toDateKey(fromDateKey('2026-03-09'))).toBe('2026-03-09')
  })

  it('weeks start on Monday', () => {
    const sunday = new Date(2026, 9, 18, 20).getTime() // Sun 18 Oct 2026
    expect(new Date(weekStart(sunday)).getDay()).toBe(1)
    expect(new Date(weekStart(sunday)).getDate()).toBe(12)
  })
})

describe('bodyweight', () => {
  it('averages multiple entries on the same day', () => {
    expect(dailyValues([{ date: '2026-01-01', value: 80 }, { date: '2026-01-01', value: 81 }]).map((p) => p.y)).toEqual([80.5])
  })

  it('7-day average uses calendar days, not entry count', () => {
    const daily = dailyValues([
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-02', value: 82 },
      { date: '2026-01-20', value: 78 }, // long gap: the old entries are out of its window
    ])
    expect(movingAverage(daily).map((p) => p.y)).toEqual([80, 81, 78])
  })
})

describe('weeklyCounts', () => {
  it('buckets into weeks with zeros for empty ones', () => {
    const now = new Date(2026, 9, 21, 12).getTime() // Wed
    const thisWeek = new Date(2026, 9, 19, 9).getTime() // Mon
    const lastWeek = new Date(2026, 9, 14, 9).getTime()
    const counts = weeklyCounts([thisWeek, thisWeek, lastWeek], 3, now)
    expect(counts.map((c) => c.y)).toEqual([0, 1, 2])
  })
})

describe('niceTicks', () => {
  it('rounds to clean steps that cover the range', () => {
    expect(niceTicks(78.4, 83.1)).toEqual([78, 80, 82, 84])
    expect(niceTicks(0, 17)).toEqual([0, 5, 10, 15, 20])
    expect(niceTicks(100, 100).length).toBeGreaterThanOrEqual(2)
  })
})

describe('change', () => {
  it('is the % change first to last', () => {
    expect(change([{ x: 0, y: 100 }, { x: 1, y: 110 }])).toBeCloseTo(10)
    expect(change([{ x: 0, y: 100 }])).toBeNull()
  })
})
