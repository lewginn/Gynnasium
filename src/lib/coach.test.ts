import { describe, expect, it } from 'vitest'
import { checkChanges, checkGoalPlan, goalText, checkNewPlan, describeChange, planRefs, planText, sanitiseTarget, trainingText, type CoachPlan } from './coach'
import type { PlanChange } from './coachSchema'
import type { Exercise, PlanExercise } from './types'

const exercise = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id.replace(/_/g, ' '),
  primaryMuscles: ['quads'],
  secondaryMuscles: [],
  region: 'lower',
  movementPattern: 'squat',
  equipment: 'barbell',
  logging: 'weight_reps',
  mechanic: 'compound',
  level: 'beginner',
  defaultRestSec: 150,
  image: null,
  ...over,
})

const squat = exercise('Barbell_Squat')
const legPress = exercise('Leg_Press', { equipment: 'machine' })
const hack = exercise('Hack_Squat', { equipment: 'machine' })
const plank = exercise('Plank', { logging: 'time', region: 'core', primaryMuscles: ['abs'] })
const library = new Map([squat, legPress, hack, plank].map((e) => [e.id, e]))

const pe = (id: string, dayId: string, ex: Exercise, order: number): { pe: PlanExercise; exercise: Exercise } => ({
  pe: { id, planDayId: dayId, exerciseId: ex.id, order, targetSets: 3, repMin: 8, repMax: 12, restSec: 120, progressionRule: 'double_progression', alternates: [], updatedAt: 1 },
  exercise: ex,
})

const detail: CoachPlan = {
  plan: { id: 'p', name: 'Legs & core', isActive: true, createdBy: 'manual', updatedAt: 1 },
  days: [
    { day: { id: 'day-a', planId: 'p', name: 'Legs', order: 0, focusMuscles: ['quads'], updatedAt: 1 }, exercises: [pe('pe-1', 'day-a', squat, 0), pe('pe-2', 'day-a', legPress, 1)] },
    { day: { id: 'day-b', planId: 'p', name: 'Core', order: 1, focusMuscles: [], updatedAt: 1 }, exercises: [pe('pe-3', 'day-b', plank, 0)] },
  ],
}

const change = (c: Partial<PlanChange> & Pick<PlanChange, 'op'>): PlanChange => ({
  day: null,
  exercise: null,
  exerciseId: null,
  name: null,
  sets: null,
  repMin: null,
  repMax: null,
  restSec: null,
  position: null,
  exercises: null,
  week: null,
  reason: '',
  ...c,
})

describe('planText and planRefs', () => {
  it('numbers days and exercises in order, with catalogue ids', () => {
    expect(planText(detail)).toBe(
      [
        'Current plan: "Legs & core" (active)',
        'd1 Legs (focus: quads)',
        '  x1 Barbell_Squat: 3 × 8–12, rest 120 s',
        '  x2 Leg_Press: 3 × 8–12, rest 120 s',
        'd2 Core',
        '  x3 Plank: 3 × 8–12 s, rest 120 s',
      ].join('\n'),
    )
    const refs = planRefs(detail)
    expect(refs.days.get('d2')).toBe('day-b')
    expect(refs.exercises.get('x2')).toBe('pe-2')
  })
})

describe('trainingText', () => {
  it('shows recent bests in the user’s units', () => {
    const text = trainingText(
      { workouts: 9, weeks: 6, bodyweightKg: { value: 80, date: '2026-10-12' }, lifts: [{ exercise: squat, weightKg: 100, reps: 5, e1rmKg: 116, date: '2026-10-15' }], otherPlans: [] },
      'lb',
    )
    expect(text).toContain('Units: lb')
    expect(text).toContain('9 workouts in the last 6 weeks (about 1.5 a week)')
    expect(text).toMatch(/Barbell_Squat: 220(\.\d)?lb × 5/)
  })
})

describe('sanitiseTarget', () => {
  it('keeps numbers in range and the rep range the right way round', () => {
    expect(sanitiseTarget({ sets: 40, repMin: 12, repMax: 8, restSec: -5 }, 'weight_reps')).toEqual({ sets: 10, repMin: 8, repMax: 12, restSec: 0 })
    expect(sanitiseTarget({ sets: 3, repMin: 1, repMax: 2000, restSec: 60 }, 'time')).toEqual({ sets: 3, repMin: 5, repMax: 600, restSec: 60 })
  })
})

describe('checkNewPlan', () => {
  it('drops exercises not in the library, and days left empty', () => {
    const { plan, skipped } = checkNewPlan(
      {
        name: ' Strength ',
        goal: 'Get strong',
        days: [
          { name: 'A', week: null, weekdays: null, focusMuscles: ['quads'], exercises: [{ exerciseId: 'Barbell_Squat', sets: 5, repMin: 5, repMax: 5, restSec: 180 }, { exerciseId: 'Made_Up', sets: 3, repMin: 8, repMax: 12, restSec: 90 }] },
          { name: 'B', week: null, weekdays: null, focusMuscles: [], exercises: [{ exerciseId: 'Also_Made_Up', sets: 3, repMin: 8, repMax: 12, restSec: 90 }] },
        ],
      },
      library,
    )
    expect(plan.name).toBe('Strength')
    expect(plan.days).toHaveLength(1)
    expect(plan.days[0].exercises.map((e) => e.exerciseId)).toEqual(['Barbell_Squat'])
    expect(skipped).toHaveLength(2)
  })
})

describe('checkChanges', () => {
  it('resolves refs to rows and library exercises', () => {
    const { changes, skipped } = checkChanges(
      [
        change({ op: 'replace_exercise', exercise: 'x2', exerciseId: 'Hack_Squat', reason: 'Leg press taken' }),
        change({ op: 'update_exercise', exercise: 'x1', sets: 5, repMin: 5, repMax: 5 }),
        change({ op: 'add_exercise', day: 'd2', exerciseId: 'Plank', sets: 3, repMin: 30, repMax: 45, restSec: 60, position: 1 }),
        change({ op: 'move_exercise', exercise: 'x2', position: 1 }),
        change({ op: 'rename_day', day: 'd2', name: 'Abs' }),
        change({ op: 'remove_day', day: 'd2' }),
        change({ op: 'add_day', name: 'Extra', exercises: [{ exerciseId: 'Barbell_Squat', sets: 3, repMin: 8, repMax: 10, restSec: 150 }] }),
        change({ op: 'rename_plan', name: 'Legs only' }),
        change({ op: 'remove_exercise', exercise: 'x3' }),
      ],
      detail,
      library,
    )
    expect(skipped).toEqual([])
    expect(changes.map((c) => c.op)).toEqual([
      'replace_exercise',
      'update_exercise',
      'add_exercise',
      'move_exercise',
      'rename_day',
      'remove_day',
      'add_day',
      'rename_plan',
      'remove_exercise',
    ])
    expect(changes[0]).toMatchObject({ planExerciseId: 'pe-2', exercise: hack, target: {}, reason: 'Leg press taken' })
    expect(changes[1]).toMatchObject({ planExerciseId: 'pe-1', target: { sets: 5, repMin: 5, repMax: 5 } })
    expect(changes[2]).toMatchObject({ dayId: 'day-b', exercise: plank, target: { sets: 3, repMin: 30, repMax: 45, restSec: 60 }, position: 1 })
  })

  it('skips changes that point at nothing, with a reason', () => {
    const { changes, skipped } = checkChanges(
      [
        change({ op: 'remove_exercise', exercise: 'x9' }),
        change({ op: 'add_exercise', day: 'd1', exerciseId: 'Smith_Machine_Moonwalk' }),
        change({ op: 'rename_day', day: 'd7', name: 'Arms' }),
        change({ op: 'update_exercise', exercise: 'x1', sets: 3 }), // no actual change
      ],
      detail,
      library,
    )
    expect(changes).toEqual([])
    expect(skipped).toHaveLength(3)
    expect(skipped[1]).toContain('Smith_Machine_Moonwalk')
  })
})

describe('describeChange', () => {
  it('says what happens, where and why', () => {
    const { changes } = checkChanges(
      [
        change({ op: 'replace_exercise', exercise: 'x2', exerciseId: 'Hack_Squat', reason: 'Leg press taken' }),
        change({ op: 'update_exercise', exercise: 'x1', sets: 5, repMin: 5, repMax: 5 }),
        change({ op: 'add_exercise', day: 'd2', exerciseId: 'Plank', sets: 3, repMin: 30, repMax: 45, restSec: 60 }),
      ],
      detail,
      library,
    )
    expect(changes.map((c) => describeChange(c, detail))).toEqual([
      { kind: 'swap', title: 'Leg Press → Hack Squat', detail: 'In Legs · Leg press taken' },
      { kind: 'edit', title: 'Barbell Squat', detail: '3 → 5 sets · 8–12 → 5 reps' },
      { kind: 'add', title: 'Plank', detail: 'Add to Core: 3 × 30–45 s, rest 1 min' },
    ])
  })
})

describe('weeks', () => {
  it('tags days with their week in the context, and checks week changes', () => {
    const weekly: CoachPlan = { ...detail, days: [{ ...detail.days[0], day: { ...detail.days[0].day, week: 2 } }, detail.days[1]] }
    expect(planText(weekly)).toContain('d1 Legs [week B] (focus: quads)')
    const { changes } = checkChanges(
      [
        { ...change({ op: 'set_day_week', day: 'd2' }), week: 1 },
        { ...change({ op: 'add_day', name: 'Arms', exercises: [] }), week: 2 },
        { ...change({ op: 'set_day_week', day: 'd1' }), week: 7 as 1 },
      ],
      weekly,
      library,
    )
    expect(changes).toMatchObject([
      { op: 'set_day_week', dayId: 'day-b', week: 1 },
      { op: 'add_day', name: 'Arms', week: 2 },
      { op: 'set_day_week', dayId: 'day-a', week: null },
    ])
    expect(describeChange(changes[0], weekly)).toMatchObject({ title: 'Core', detail: 'Move to week A' })
    expect(checkNewPlan({ name: 'P', goal: '', days: [{ name: 'A', week: 2, weekdays: null, focusMuscles: [], exercises: [{ exerciseId: 'Plank', sets: 3, repMin: 30, repMax: 60, restSec: 60 }] }] }, library).plan.days[0].week).toBe(2)
  })
})

describe('planning to a goal', () => {
  const goal = { id: 'g', name: 'Ibiza', startsOn: '2026-10-01', targetDate: '2026-12-31', targets: [], isActive: true, updatedAt: 0, description: 'Look lean' }
  const plan = (name: string, exerciseId = 'Barbell_Squat') => ({
    name,
    goal: '',
    days: [{ name: 'Full body', week: null, weekdays: [0, 3], focusMuscles: [], exercises: [{ exerciseId, sets: 3, repMin: 5, repMax: 8, restSec: 150 }] }],
  })

  it('describes the goal, targets and days off for the coach', () => {
    const text = goalText(
      goal,
      [{ label: 'Bodyweight', unit: 'weight', start: 85, current: 84, target: 78, direction: 'down', done: false, fraction: 0.1, perWeek: -0.6 }],
      [],
      ['2026-12-25', '2027-01-02'],
      '2026-10-20',
      'kg',
    )
    expect(text).toContain('Today: 2026-10-20 (Tuesday)')
    expect(text).toContain('"Ibiza" on 2026-12-31: 72 days (10 weeks) away.')
    expect(text).toContain('Bodyweight: now 84kg, target 78kg, started at 85kg')
    expect(text).toContain('Days off (no training): 2026-12-25')
    expect(text).not.toContain('2027-01-02')
  })

  it('keeps phases inside today…goal date, in order, without overlaps', () => {
    const { phases, nutrition, skipped } = checkGoalPlan(
      {
        phases: [
          { name: 'Lean out', startsOn: '2026-11-25', endsOn: '2027-01-10', focus: 'Cut', plan: plan('Lean out') },
          { name: 'Build', startsOn: '2026-10-01', endsOn: '2026-11-30', focus: 'Strength', plan: plan('Build') },
          { name: 'Ghost', startsOn: '2027-02-01', endsOn: '2027-03-01', focus: '', plan: plan('Ghost') },
          { name: 'Bad', startsOn: 'soon', endsOn: '2026-12-01', focus: '', plan: plan('Bad') },
          { name: 'Nothing usable', startsOn: '2026-12-31', endsOn: '2026-12-31', focus: '', plan: plan('X', 'Not_Real') },
        ],
        nutrition: { calories: 2300, proteinG: 160, note: ' Eat well ' },
      },
      goal,
      library,
      '2026-10-20',
    )
    expect(phases.map((p) => [p.name, p.startsOn, p.endsOn])).toEqual([
      ['Build', '2026-10-20', '2026-11-30'], // can't start in the past
      ['Lean out', '2026-12-01', '2026-12-31'], // after Build, and ends on the goal date
    ])
    expect(phases[0].plan.days[0].weekdays).toEqual([0, 3])
    expect(nutrition).toEqual({ calories: 2300, proteinG: 160, note: 'Eat well' })
    expect(skipped.length).toBeGreaterThanOrEqual(3)
  })

  it('drops nutrition targets outside a sensible range', () => {
    expect(checkGoalPlan({ phases: [], nutrition: { calories: 600, proteinG: 100, note: '' } }, goal, library, '2026-10-20').nutrition).toBeNull()
  })
})
