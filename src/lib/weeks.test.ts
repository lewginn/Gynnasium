import { describe, expect, it } from 'vitest'
import { dayLabel, daysPerWeek, nextDay, sortDays } from './weeks'

const day = (id: string, order: number, week?: 1 | 2) => ({ id, name: id, order, week })

describe('alternating weeks', () => {
  it('orders week A before week B', () => {
    const days = sortDays([day('pullB', 1, 2), day('pushA', 0, 1), day('pushB', 0, 2), day('pullA', 1, 1)])
    expect(days.map((d) => d.id)).toEqual(['pushA', 'pullA', 'pushB', 'pullB'])
  })

  it('rotates through both weeks, then back to the start', () => {
    const days = sortDays([day('pushA', 0, 1), day('pullA', 1, 1), day('pushB', 2, 2), day('pullB', 3, 2)])
    expect(nextDay(days, undefined)?.id).toBe('pushA')
    expect(nextDay(days, 'pullA')?.id).toBe('pushB')
    expect(nextDay(days, 'pullB')?.id).toBe('pushA')
    expect(nextDay([], 'x')).toBeNull()
  })

  it('labels days with their week, and counts workouts per week', () => {
    expect(dayLabel(day('Push', 0, 2))).toBe('Push · Week B')
    expect(dayLabel(day('Push', 0))).toBe('Push')
    expect(daysPerWeek([day('a', 0, 1), day('b', 1, 1), day('c', 2, 2)])).toBe(2)
    expect(daysPerWeek([day('a', 0), day('b', 1), day('c', 2)])).toBe(3)
  })
})
