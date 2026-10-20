import { describe, expect, it } from 'vitest'
import { addDays, dayPlan, daysBetween, monthGrid, nextWorkout, planOn, weekOn, weekdayOf, type PlanWithDays } from './schedule'
import type { Plan, PlanDay } from './types'

const plan = (id: string, over: Partial<Plan> = {}): Plan => ({ id, name: id, isActive: false, createdBy: 'manual', updatedAt: 0, ...over })
const day = (id: string, weekdays: number[], over: Partial<PlanDay> = {}): PlanDay => ({
  id,
  planId: '',
  name: id,
  order: 0,
  focusMuscles: [],
  weekdays,
  updatedAt: 0,
  ...over,
})
const none = new Map<string, string | undefined>()

// 2026-10-19 is a Monday.
const MON = '2026-10-19'

describe('dates', () => {
  it('counts weekdays from Monday and days between dates', () => {
    expect(weekdayOf(MON)).toBe(0)
    expect(weekdayOf('2026-10-25')).toBe(6)
    expect(addDays(MON, 13)).toBe('2026-11-01')
    expect(daysBetween(MON, '2027-06-01')).toBe(225)
  })

  it('lays a month out in whole weeks, Monday first', () => {
    const grid = monthGrid(2026, 10) // November 2026: starts on a Sunday
    expect(grid[0][0]).toEqual({ date: '2026-10-26', inMonth: false })
    expect(grid[0][6]).toEqual({ date: '2026-11-01', inMonth: true })
    expect(grid.at(-1)!.at(-1)!.date).toBe('2026-12-06')
    expect(grid.every((w) => w.length === 7)).toBe(true)
  })
})

describe('what is on a date', () => {
  const ppl: PlanWithDays = { plan: plan('ppl', { isActive: true }), days: [day('push', [0, 3]), day('pull', [1, 4]), day('legs', [2])] }

  it('follows the weekdays each day is on', () => {
    expect(dayPlan(MON, [ppl], none)).toMatchObject({ kind: 'workout', day: { id: 'push' } })
    expect(dayPlan('2026-10-23', [ppl], none)).toMatchObject({ kind: 'workout', day: { id: 'pull' } })
    expect(dayPlan('2026-10-24', [ppl], none)).toMatchObject({ kind: 'rest' })
  })

  it('skips days off, saying what was skipped', () => {
    const off = new Map([[MON, 'Travelling']])
    expect(dayPlan(MON, [ppl], off)).toEqual({ kind: 'off', note: 'Travelling', skipped: { plan: ppl.plan, day: ppl.days[0] } })
    expect(nextWorkout('2026-10-18', [ppl], off)).toMatchObject({ date: '2026-10-20', day: { id: 'pull' } })
  })

  it('keeps the up-next rotation for plans without fixed weekdays', () => {
    const rotating: PlanWithDays = { plan: plan('r', { isActive: true }), days: [day('a', []), day('b', [])] }
    expect(dayPlan(MON, [rotating], none)).toEqual({ kind: 'rotation', plan: rotating.plan })
    expect(dayPlan(MON, [], none)).toEqual({ kind: 'none' })
  })

  it('alternates week A and B by calendar week from the plan start', () => {
    const ab: PlanWithDays = {
      plan: plan('ab', { isActive: true }),
      days: [day('pushA', [0], { week: 1 }), day('pushB', [0], { week: 2 })],
    }
    const a = weekOn(MON, ab.plan)
    expect(weekOn(addDays(MON, 7), ab.plan)).not.toBe(a)
    expect(weekOn(addDays(MON, 14), ab.plan)).toBe(a)
    expect(weekOn(addDays(MON, 6), ab.plan)).toBe(a) // the same week's Sunday
    const dated = { ...ab, plan: { ...ab.plan, startsOn: MON } }
    expect(weekOn(MON, dated.plan)).toBe(1)
    expect(dayPlan(MON, [dated], none)).toMatchObject({ day: { id: 'pushA' } })
    expect(dayPlan(addDays(MON, 7), [dated], none)).toMatchObject({ day: { id: 'pushB' } })
  })

  it("uses a goal's phases on their dates, and the active plan elsewhere", () => {
    const build: PlanWithDays = { plan: plan('build', { goalId: 'g', startsOn: '2026-11-01', endsOn: '2026-11-30' }), days: [day('b', [0])] }
    const cut: PlanWithDays = { plan: plan('cut', { goalId: 'g', startsOn: '2026-12-01', endsOn: '2026-12-20' }), days: [day('c', [0])] }
    const plans = [ppl, build, cut]
    expect(planOn('2026-10-31', plans)?.plan.id).toBe('ppl')
    expect(planOn('2026-11-15', plans)?.plan.id).toBe('build')
    expect(planOn('2026-12-01', plans)?.plan.id).toBe('cut')
    expect(planOn('2026-12-21', plans)?.plan.id).toBe('ppl')
    // A dated phase that's also the active plan doesn't spill outside its dates.
    expect(planOn('2027-01-05', [{ ...cut, plan: { ...cut.plan, isActive: true } }])).toBeNull()
  })
})
