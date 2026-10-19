import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { PLAN_TEMPLATES } from '../lib/templates'
import { db, ensureExerciseLibrary } from './db'
import {
  addPlanDay,
  addPlanExercise,
  addSessionExercise,
  completeSet,
  createPlan,
  createPlanFromTemplate,
  discardSession,
  exerciseHistory,
  finishSession,
  getActiveSession,
  loadPlan,
  loadSession,
  movePlanExercise,
  setActivePlan,
  startSession,
  swapSessionExercise,
  uncompleteSet,
  updateSet,
} from './repo'

const exercise = async (id: string) => (await db.exercises.get(id))!

beforeEach(async () => {
  await Promise.all(db.tables.filter((t) => t.name !== 'exercises' && t.name !== 'kv').map((t) => t.clear()))
  await ensureExerciseLibrary()
})

/** Logs a full workout of one exercise with the given (kg, reps) sets. */
async function logWorkout(exerciseId: string, sets: [number, number][]) {
  const sessionId = await startSession()
  const seId = await addSessionExercise(sessionId, await exercise(exerciseId))
  const rows = (await loadSession(sessionId))!.exercises.find((e) => e.se.id === seId)!.sets
  const prs = []
  for (const [i, [kg, reps]] of sets.entries()) {
    await updateSet(rows[i].id, { weightKg: kg, reps })
    prs.push(await completeSet(rows[i].id))
  }
  await finishSession(sessionId)
  return { sessionId, prs }
}

describe('plans', () => {
  it('first plan becomes active; switching active works', async () => {
    const a = await createPlan('A')
    const b = await createPlan('B')
    expect((await db.plans.get(a))!.isActive).toBe(true)
    expect((await db.plans.get(b))!.isActive).toBe(false)
    await setActivePlan(b)
    expect((await db.plans.get(a))!.isActive).toBe(false)
    expect((await db.plans.get(b))!.isActive).toBe(true)
  })

  it('infers day focus from its name and reorders exercises', async () => {
    const planId = await createPlan('Mine')
    const dayId = await addPlanDay(planId, 'Back day')
    const pulls = await addPlanExercise(dayId, await exercise('Pullups'))
    await addPlanExercise(dayId, await exercise('Seated_Cable_Rows'))
    await movePlanExercise(pulls, 1)
    const plan = (await loadPlan(planId))!
    expect(plan.days[0].day.focusMuscles).toEqual(['lats', 'upper_back'])
    expect(plan.days[0].exercises.map((e) => e.exercise.id)).toEqual(['Seated_Cable_Rows', 'Pullups'])
  })

  it('creates every template with all its exercises', async () => {
    for (const t of PLAN_TEMPLATES) {
      const plan = (await loadPlan(await createPlanFromTemplate(t)))!
      expect(plan.days.map((d) => d.exercises.length)).toEqual(t.days.map((d) => d.exercises.length))
    }
  })
})

describe('workouts', () => {
  it('starts from a plan day with planned sets', async () => {
    const plan = (await loadPlan(await createPlanFromTemplate(PLAN_TEMPLATES[0])))!
    const sessionId = await startSession(plan.days[0].day.id)
    const s = (await loadSession(sessionId))!
    expect(s.session.name).toBe('Push')
    expect(s.exercises[0].sets).toHaveLength(4)
    expect(s.exercises[0].sets.every((set) => !set.completedAt)).toBe(true)
    // Only one workout at a time: starting again resumes it.
    expect(await startSession()).toBe(sessionId)
  })

  it('pre-fills sets from last time', async () => {
    await logWorkout('Barbell_Squat', [[100, 5], [100, 5], [105, 3]])
    const sessionId = await startSession()
    await addSessionExercise(sessionId, await exercise('Barbell_Squat'))
    const sets = (await loadSession(sessionId))!.exercises[0].sets
    expect(sets.map((s) => [s.weightKg, s.reps])).toEqual([[100, 5], [100, 5], [105, 3]])
  })

  it('detects PRs against earlier workouts only', async () => {
    const first = await logWorkout('Barbell_Squat', [[100, 5], [110, 5]])
    expect(first.prs.flat()).toEqual([]) // baseline session

    const second = await logWorkout('Barbell_Squat', [[100, 5], [115, 5]])
    expect(second.prs[0]).toEqual([])
    expect(second.prs[1]).toContain('max_weight')
  })

  it('editing a set carries the value down to later untouched sets', async () => {
    const sessionId = await startSession()
    await addSessionExercise(sessionId, await exercise('Barbell_Squat'))
    const [s1, s2, s3] = (await loadSession(sessionId))!.exercises[0].sets
    await updateSet(s3.id, { reps: 6 }) // changed by hand: keeps its reps
    await updateSet(s1.id, { weightKg: 80, reps: 8 })
    const after = (await loadSession(sessionId))!.exercises[0].sets
    expect(after.map((s) => [s.weightKg, s.reps])).toEqual([
      [80, 8],
      [80, 8],
      [80, 6],
    ])
    // Completed sets are never overwritten.
    await completeSet(s2.id)
    await updateSet(s1.id, { weightKg: 85 })
    expect((await db.setLogs.get(s2.id))!.weightKg).toBe(80)
    expect((await db.setLogs.get(s3.id))!.weightKg).toBe(85)
  })

  it('un-completing a set removes it from history', async () => {
    const sessionId = await startSession()
    await addSessionExercise(sessionId, await exercise('Barbell_Squat'))
    const [set] = (await loadSession(sessionId))!.exercises[0].sets
    await updateSet(set.id, { weightKg: 60, reps: 5 })
    await completeSet(set.id)
    await uncompleteSet(set.id)
    expect((await db.setLogs.get(set.id))!.completedAt).toBeUndefined()
  })

  it('finishing drops sets never done; an empty workout is discarded', async () => {
    const { sessionId } = await logWorkout('Barbell_Squat', [[100, 5]])
    const s = (await loadSession(sessionId))!
    expect(s.session.endedAt).toBeTruthy()
    expect(s.exercises[0].sets).toHaveLength(1)

    const empty = await startSession()
    await addSessionExercise(empty, await exercise('Leg_Press'))
    expect(await finishSession(empty)).toBe(false)
    expect(await loadSession(empty)).toBeNull()
    expect(await getActiveSession()).toBeUndefined()
  })

  it('swapping keeps completed sets and refills the rest from the new exercise', async () => {
    await logWorkout('Seated_Leg_Curl', [[50, 12], [50, 12], [50, 12]])
    const sessionId = await startSession()
    const seId = await addSessionExercise(sessionId, await exercise('Lying_Leg_Curls'))
    const [first] = (await loadSession(sessionId))!.exercises[0].sets
    await updateSet(first.id, { weightKg: 40, reps: 10 })
    await completeSet(first.id)

    await swapSessionExercise(seId, await exercise('Seated_Leg_Curl'))
    const ex = (await loadSession(sessionId))!.exercises[0]
    expect(ex.exercise.id).toBe('Seated_Leg_Curl')
    expect(ex.se.swappedFromExerciseId).toBe('Lying_Leg_Curls')
    expect(ex.sets.map((s) => [s.setNumber, s.weightKg, !!s.completedAt])).toEqual([
      [1, 40, true],
      [2, 50, false],
      [3, 50, false],
    ])
  })

  it('history groups completed sets by workout, newest first, excluding discarded ones', async () => {
    await logWorkout('Barbell_Squat', [[100, 5]])
    await logWorkout('Barbell_Squat', [[105, 5]])
    const discarded = await startSession()
    await addSessionExercise(discarded, await exercise('Barbell_Squat'))
    const [s] = (await loadSession(discarded))!.exercises[0].sets
    await completeSet(s.id)
    await discardSession(discarded)

    const history = await exerciseHistory('Barbell_Squat')
    expect(history.map((h) => h.sets.map((x) => x.weightKg))).toEqual([[105], [100]])
  })
})
