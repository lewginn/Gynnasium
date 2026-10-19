import { describe, expect, it } from 'vitest'
import { startOfWeek, weekStreak, weekSummary } from './week'

// Wednesday 21 October 2026, 18:00 local time.
const wed = new Date(2026, 9, 21, 18).getTime()
const day = (d: number, h = 9) => new Date(2026, 9, d, h).getTime()

describe('startOfWeek', () => {
  it('is Monday midnight', () => {
    expect(startOfWeek(wed)).toBe(new Date(2026, 9, 19).getTime())
    // Sunday belongs to the week that started the Monday before.
    expect(startOfWeek(day(25))).toBe(new Date(2026, 9, 19).getTime())
  })
})

describe('weekSummary', () => {
  it('marks the days trained this week, Monday first', () => {
    const s = weekSummary([day(19), day(21, 7), day(21, 19), day(18), day(26)], wed)
    expect(s.trained).toEqual([true, false, true, false, false, false, false])
    expect(s.count).toBe(3) // last Sunday and next Monday are other weeks
    expect(s.todayIndex).toBe(2)
  })
})

describe('weekStreak', () => {
  it('counts weeks in a row with a workout', () => {
    const sep24 = new Date(2026, 8, 24).getTime() // week of Sep 21; the week of Sep 28 was missed
    expect(weekStreak([day(20), day(13), day(6), sep24], wed)).toBe(3)
    expect(weekStreak([day(20), day(13), day(6), day(1)], wed)).toBe(4) // Oct 1 is the week of Sep 28
  })

  it('an empty week so far does not break the streak', () => {
    expect(weekStreak([day(13), day(6)], wed)).toBe(2)
  })

  it('is zero after a missed week', () => {
    expect(weekStreak([day(6)], wed)).toBe(0)
    expect(weekStreak([], wed)).toBe(0)
  })
})
