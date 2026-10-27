import { describe, expect, it } from 'vitest'
import { suggestNext } from './progression'
import { REVIEW_PROMPT, hasReview, reviewHeadline, reviewText, showReviewOnToday, stalledBest, weeklyReview, type ReviewInput } from './review'
import type { Exercise, Plan, PlanDay, PlanExercise, SetLog, WorkoutSession } from './types'

const exercise = (id: string, over: Partial<Exercise>): Exercise => ({
  id,
  name: id.replace(/_/g, ' '),
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  region: 'upper',
  movementPattern: 'horizontal_push',
  equipment: 'barbell',
  logging: 'weight_reps',
  mechanic: 'compound',
  level: 'beginner',
  defaultRestSec: 120,
  image: null,
  ...over,
})
const bench = exercise('Bench', {})
const squat = exercise('Squat', { primaryMuscles: ['quads'], region: 'lower', movementPattern: 'squat' })
const curl = exercise('Curl', { primaryMuscles: ['biceps'], equipment: 'dumbbell', mechanic: 'isolation' })
const exercises = new Map([bench, squat, curl].map((e) => [e.id, e]))

const plan = (over: Partial<Plan> = {}): Plan => ({ id: 'p1', name: 'Plan', isActive: true, createdBy: 'manual', updatedAt: 0, ...over })
const day = (id: string, order: number, over: Partial<PlanDay> = {}): PlanDay => ({ id, planId: 'p1', name: id, order, focusMuscles: [], updatedAt: 0, ...over })
const pe = (planDayId: string, exerciseId: string, targetSets: number, over: Partial<PlanExercise> = {}): PlanExercise => ({
  id: `${planDayId}-${exerciseId}`,
  planDayId,
  exerciseId,
  order: 0,
  targetSets,
  repMin: 5,
  repMax: 8,
  restSec: 120,
  progressionRule: 'double_progression',
  alternates: [],
  updatedAt: 0,
  ...over,
})

// Today is Monday 26 October 2026: the review covers Monday 19 to Sunday 25 October.
const TODAY = '2026-10-26'
const at = (date: number, hour = 18) => new Date(2026, 9, date, hour).getTime()

let n = 0
type S = Partial<SetLog> & { kg: number; reps: number; ex?: string }
function workout(date: number, sets: S[], over: Partial<WorkoutSession> = {}) {
  const id = `s${++n}`
  const session: WorkoutSession = { id, name: 'Workout', startedAt: at(date), endedAt: at(date) + 3600_000, updatedAt: 0, ...over }
  return {
    session,
    sets: sets.map(({ kg, reps, ex = 'Bench', ...s }, i): SetLog => ({
      id: `${id}-${i}`,
      sessionExerciseId: `${id}-${ex}`,
      exerciseId: ex,
      setNumber: i + 1,
      setType: 'working',
      weightKg: kg,
      reps,
      completedAt: at(date) + i * 60_000,
      updatedAt: 0,
      ...s,
    })),
  }
}
const sets = (kg: number, ...reps: number[]) => reps.map((r) => ({ kg, reps: r }))

const rotation = { plan: plan(), days: [day('push', 0), day('legs', 1)] }
const planExercises = [pe('push', 'Bench', 4), pe('push', 'Curl', 3), pe('legs', 'Squat', 4)]
const input = (over: Partial<ReviewInput>): ReviewInput => ({
  today: TODAY,
  plans: [rotation],
  planExercises,
  daysOff: new Map(),
  workouts: [],
  exercises,
  units: 'kg',
  ...over,
})

describe('weeklyReview: workouts', () => {
  it('reviews the Monday to Sunday before this week', () => {
    const r = weeklyReview(input({}))
    expect([r.from, r.to]).toEqual(['2026-10-19', '2026-10-25'])
    // Any day of this week reviews the same week.
    expect(weeklyReview(input({ today: '2026-11-01' })).from).toBe('2026-10-19')
  })

  it('counts finished workouts that week against the rotation’s days per week', () => {
    const r = weeklyReview(
      input({
        workouts: [
          workout(18, sets(80, 5)), // the Sunday before
          workout(19, sets(80, 5)),
          workout(25, sets(80, 5), { startedAt: new Date(2026, 9, 25, 23, 30).getTime() }), // late Sunday still counts
          workout(21, sets(80, 5), { deletedAt: 1 }),
          workout(22, sets(80, 5), { endedAt: undefined }), // never finished
          workout(26, sets(80, 5)), // this week
        ],
      }),
    )
    expect(r.workouts).toEqual({ done: 2, planned: 2 })
    expect(r.hasPlan).toBe(true)
  })

  it('with fixed weekdays, counts the scheduled days minus days off', () => {
    const scheduled = { plan: plan(), days: [day('push', 0, { weekdays: [0, 3] }), day('legs', 1, { weekdays: [5] })] }
    expect(weeklyReview(input({ plans: [scheduled] })).workouts.planned).toBe(3)
    const off = new Map([['2026-10-22', 'Travel']]) // Thursday
    expect(weeklyReview(input({ plans: [scheduled], daysOff: off })).workouts.planned).toBe(2)
  })

  it('alternating weeks count the bigger week, as This week does', () => {
    const ab = { plan: plan(), days: [day('a1', 0, { week: 1 }), day('a2', 1, { week: 1 }), day('b1', 2, { week: 2 })] }
    expect(weeklyReview(input({ plans: [ab] })).workouts.planned).toBe(2)
  })

  it('without a plan there is nothing planned, and nothing to review without workouts either', () => {
    const r = weeklyReview(input({ plans: [], workouts: [workout(20, sets(80, 5))] }))
    expect(r.workouts).toEqual({ done: 1, planned: null })
    expect(r.hasPlan).toBe(false)
    expect(hasReview(r)).toBe(true)
    expect(hasReview(weeklyReview(input({ plans: [] })))).toBe(false)
    expect(hasReview(weeklyReview(input({ plans: [{ ...rotation, plan: plan({ deletedAt: 1 }) }] })))).toBe(false)
  })
})

describe('weeklyReview: sets', () => {
  it('counts working sets against the plan day’s target sets; warm-ups and unticked sets never count', () => {
    const push = workout(
      20,
      [
        { kg: 40, reps: 10, setType: 'warmup' },
        ...sets(80, 8, 8, 7),
        { kg: 80, reps: 6, completedAt: undefined },
        { kg: 80, reps: 6, deletedAt: 1 },
        { kg: 12, reps: 12, ex: 'Curl' },
      ],
      { planDayId: 'push' },
    )
    const free = workout(23, sets(100, 5, 5)) // no plan day: only in the total
    const r = weeklyReview(input({ workouts: [push, free] }))
    expect(r.planSets).toEqual({ done: 4, planned: 7 })
    expect(r.totalSets).toBe(6)
    expect(weeklyReview(input({ workouts: [free] })).planSets).toBeNull()
  })

  it('counts sets per primary muscle and flags the plan’s muscles under 10', () => {
    const r = weeklyReview(input({ workouts: [workout(20, [...sets(80, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8), { kg: 12, reps: 12, ex: 'Curl' }])] }))
    expect(r.muscles).toEqual([
      { muscle: 'chest', sets: 10 },
      { muscle: 'biceps', sets: 1 },
    ])
    // Quads are in the plan but weren't trained; chest made 10.
    expect(r.lowMuscles).toEqual([
      { muscle: 'quads', sets: 0 },
      { muscle: 'biceps', sets: 1 },
    ])
  })

  it('doesn’t flag muscles the plan doesn’t train', () => {
    const r = weeklyReview(input({ planExercises: [pe('push', 'Bench', 4)], workouts: [workout(20, [{ kg: 100, reps: 5, ex: 'Squat' }])] }))
    expect(r.lowMuscles.map((m) => m.muscle)).toEqual(['chest'])
  })
})

describe('weeklyReview: PRs', () => {
  it('lists each exercise’s best PR set that week, with every kind of PR it set', () => {
    const r = weeklyReview(
      input({
        workouts: [
          workout(13, [{ kg: 90, reps: 3, prs: ['max_weight'] }]), // the week before
          workout(20, [{ kg: 80, reps: 9, prs: ['max_reps_at_weight'] }, { kg: 85, reps: 5, prs: ['max_weight', 'max_e1rm'] }]),
          workout(22, [{ kg: 50, reps: 10, setType: 'warmup', prs: ['max_weight'] }, { kg: 12, reps: 15, ex: 'Curl', deletedAt: 1, prs: ['max_weight'] }]),
        ],
      }),
    )
    expect(r.prs).toHaveLength(1)
    expect(r.prs[0]).toMatchObject({ exercise: { id: 'Bench' }, set: { weightKg: 85, reps: 5 }, kinds: ['max_weight', 'max_e1rm', 'max_reps_at_weight'] })
  })
})

describe('weeklyReview: stalled lifts', () => {
  const pushDay = { planDayId: 'push' }

  it('flags a lift whose top set hasn’t gone up in 3 workouts, with the note the workout will show', () => {
    const w = [workout(15, sets(80, 8, 7, 6), pushDay), workout(19, sets(80, 8, 6, 6), pushDay), workout(22, sets(80, 7, 7, 6), pushDay)]
    const r = weeklyReview(input({ workouts: w }))
    expect(r.stalled).toHaveLength(1)
    expect(r.stalled[0].best).toMatchObject({ weightKg: 80, reps: 8 })
    const next = suggestNext({
      history: [w[2].sets, w[1].sets],
      target: { sets: 4, repMin: 5, repMax: 8 },
      exercise: bench,
      rule: 'double_progression',
      units: 'kg',
    })
    expect(r.stalled[0].note).toBe(next.note)
  })

  it('more reps on the later sets, or more weight, is progress', () => {
    const reps = [workout(15, sets(80, 8, 6, 6), pushDay), workout(19, sets(80, 8, 7, 6), pushDay), workout(22, sets(80, 8, 6, 6), pushDay)]
    expect(weeklyReview(input({ workouts: reps })).stalled).toEqual([])
    const heavier = [workout(15, sets(80, 8, 8), pushDay), workout(19, sets(82.5, 5, 5), pushDay), workout(22, sets(80, 8, 8), pushDay)]
    expect(weeklyReview(input({ workouts: heavier })).stalled).toEqual([])
  })

  it('needs 3 workouts, ending with one last week; later workouts don’t change last week’s review', () => {
    const two = [workout(19, sets(80, 8), pushDay), workout(22, sets(80, 8), pushDay)]
    expect(weeklyReview(input({ workouts: two })).stalled).toEqual([])
    const notLastWeek = [workout(5, sets(80, 8)), workout(8, sets(80, 8)), workout(12, sets(80, 8))]
    expect(weeklyReview(input({ workouts: notLastWeek })).stalled).toEqual([])
    const thenThisWeek = [...two, workout(15, sets(80, 8), pushDay), workout(26, sets(85, 8), pushDay)]
    expect(weeklyReview(input({ workouts: thenThisWeek })).stalled).toHaveLength(1)
  })

  it('skips lifts with progression off', () => {
    const w = [workout(15, sets(80, 8)), workout(19, sets(80, 8)), workout(22, sets(80, 8))].map((x) => ({ ...x, session: { ...x.session, planDayId: 'push' } }))
    const off = [pe('push', 'Bench', 4, { progressionRule: 'none' })]
    expect(weeklyReview(input({ planExercises: off, workouts: w })).stalled).toEqual([])
  })

  it('compares seconds for timed lifts and added weight for bodyweight ones', () => {
    const set = (weightKg: number, reps: number, durationSec?: number) => ({ weightKg, reps, durationSec }) as SetLog
    expect(stalledBest([[set(0, 0, 40)], [set(0, 0, 45)], [set(0, 0, 45)]], 'time')).toMatchObject({ durationSec: 45 })
    expect(stalledBest([[set(0, 0, 50)], [set(0, 0, 45)], [set(0, 0, 45)]], 'time')).toBeNull()
    expect(stalledBest([[set(-10, 8)], [set(-20, 8)], [set(-20, 8)]], 'bodyweight')).toBeNull() // less assistance
  })
})

describe('showing the review', () => {
  it('Today offers it Monday to Wednesday', () => {
    const r = weeklyReview(input({ workouts: [workout(20, sets(80, 5))] }))
    expect(['2026-10-26', '2026-10-27', '2026-10-28'].map((d) => showReviewOnToday(r, d))).toEqual([true, true, true])
    expect(['2026-10-29', '2026-11-01'].map((d) => showReviewOnToday(r, d))).toEqual([false, false])
  })

  it('has a one-line headline', () => {
    const r = weeklyReview(input({ workouts: [workout(20, [{ kg: 85, reps: 5, prs: ['max_weight'] }])] }))
    expect(reviewHeadline(r)).toBe('1 of 2 workouts · 1 PR')
    expect(reviewHeadline(weeklyReview(input({ plans: [], workouts: [workout(20, sets(80, 5))] })))).toBe('1 workout')
  })

  it('reads as text for the coach', () => {
    const w = [workout(15, sets(80, 8)), workout(19, sets(80, 8)), workout(22, [...sets(80, 8), { kg: 14, reps: 10, ex: 'Curl', prs: ['max_weight'] }])]
    const text = reviewText(weeklyReview(input({ workouts: w })), 'kg')
    expect(text).toContain('2026-10-19 to 2026-10-25')
    expect(text).toContain('Workouts: 2 of 2 planned.')
    expect(text).toContain('PRs: Curl 14kg × 10 (Heaviest weight).')
    expect(text).toContain('Bench: stuck at 80kg × 8')
    expect(text).toContain('Working sets per muscle (primary muscles only): chest 2, biceps 1.')
    expect(text).toContain('Under 10 sets, though the plan trains them: quads 0, biceps 1, chest 2.')
    expect(REVIEW_PROMPT).not.toMatch(/!/)
  })
})
