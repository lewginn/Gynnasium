import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { checkChanges } from '../lib/coach'
import type { PlanChange } from '../lib/coachSchema'
import { PLAN_TEMPLATES } from '../lib/templates'
import { db, ensureExerciseLibrary } from './db'
import {
  addPlanDay,
  addPlanExercise,
  addSessionExercise,
  addSet,
  applyPlanChanges,
  coachTrainingSummary,
  completeSet,
  createPlan,
  createPlanFromProposal,
  createPlanFromTemplate,
  discardSession,
  exerciseHistory,
  finishSession,
  finishedSessionStarts,
  getActiveSession,
  loadExercise,
  loadExercises,
  loadPlan,
  loadSession,
  movePlanExercise,
  moveSessionExercise,
  saveSessionEdits,
  setLoggingOverride,
  setActivePlan,
  startSession,
  swapSessionExercise,
  uncompleteSet,
  updateSet,
  volumeSinceKg,
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

  it('pre-fills sets from last time, aiming a rep higher (within the 6–10 default range)', async () => {
    await logWorkout('Barbell_Squat', [[100, 5], [100, 7], [105, 3]])
    const sessionId = await startSession()
    await addSessionExercise(sessionId, await exercise('Barbell_Squat'))
    const sets = (await loadSession(sessionId))!.exercises[0].sets
    expect(sets.map((s) => [s.weightKg, s.reps])).toEqual([[100, 6], [100, 8], [105, 6]])
  })

  it('progresses a plan exercise: more weight once every set hits the top of its range', async () => {
    const planId = await createPlan('P')
    const dayId = await addPlanDay(planId, 'Legs')
    const peId = await addPlanExercise(dayId, await exercise('Barbell_Squat'))
    await db.planExercises.update(peId, { targetSets: 2, repMin: 5, repMax: 8 })
    const s1 = await startSession(dayId)
    for (const set of (await loadSession(s1))!.exercises[0].sets) {
      await updateSet(set.id, { weightKg: 100, reps: 8 })
      await completeSet(set.id)
    }
    await finishSession(s1)
    const s2 = await startSession(dayId)
    expect((await loadSession(s2))!.exercises[0].sets.map((s) => [s.weightKg, s.reps])).toEqual([[105, 5], [105, 5]])
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

describe('bodyweight and timed', () => {
  it('timed exercises are pre-filled with seconds, then from last time', async () => {
    const s1 = await startSession()
    await addSessionExercise(s1, await exercise('Plank'))
    let [first] = (await loadSession(s1))!.exercises[0].sets
    expect(first.durationSec).toBe(30)
    await updateSet(first.id, { durationSec: 75 })
    await completeSet(first.id)
    await finishSession(s1)

    const s2 = await startSession()
    await addSessionExercise(s2, await exercise('Plank'))
    ;[first] = (await loadSession(s2))!.exercises[0].sets
    expect(first.durationSec).toBe(75)
    await updateSet(first.id, { durationSec: 90 })
    expect(await completeSet(first.id)).toEqual(['max_duration'])
  })

  it('"log as" overrides change how an exercise is treated', async () => {
    expect((await loadExercise('Leg_Press'))!.logging).toBe('weight_reps')
    await setLoggingOverride('Leg_Press', 'time')
    expect((await loadExercise('Leg_Press'))!.logging).toBe('time')
    await setLoggingOverride('Leg_Press', 'weight_reps') // back to the library default: override removed
    expect(await db.kv.get('loggingOverrides')).toEqual({ key: 'loggingOverrides', value: {} })
  })
})

describe('reordering and editing workouts', () => {
  it('moves exercises within a workout', async () => {
    const sessionId = await startSession()
    const a = await addSessionExercise(sessionId, await exercise('Barbell_Squat'))
    await addSessionExercise(sessionId, await exercise('Leg_Press'))
    await moveSessionExercise(a, 1)
    expect((await loadSession(sessionId))!.exercises.map((e) => e.exercise.id)).toEqual(['Leg_Press', 'Barbell_Squat'])
  })

  it('editing an old workout re-checks PRs in later ones', async () => {
    const first = await logWorkout('Barbell_Squat', [[100, 5]])
    const second = await logWorkout('Barbell_Squat', [[105, 5]])
    expect(second.prs[0]).toContain('max_weight')

    // Turns out the first workout was 110kg: the second is no longer a PR.
    const [old] = (await loadSession(first.sessionId))!.exercises[0].sets
    await updateSet(old.id, { weightKg: 110 })
    expect(await saveSessionEdits(first.sessionId)).toBe(true)
    const [later] = (await loadSession(second.sessionId))!.exercises[0].sets
    expect(later.prs).toEqual([])

    // Delete the first workout entirely: the second becomes the baseline.
    await discardSession(first.sessionId)
    expect((await db.setLogs.get(later.id))!.prs).toEqual([])
    expect(await exerciseHistory('Barbell_Squat')).toHaveLength(1)
  })

  it('sets ticked while editing a finished workout are filed under that workout', async () => {
    const { sessionId } = await logWorkout('Barbell_Squat', [[100, 5]])
    const endedAt = (await db.sessions.get(sessionId))!.endedAt
    const seId = (await loadSession(sessionId))!.exercises[0].se.id
    await addSet(seId)
    const added = (await loadSession(sessionId))!.exercises[0].sets.at(-1)!
    await completeSet(added.id)
    expect((await db.setLogs.get(added.id))!.completedAt).toBe(endedAt)
  })

  it('saving an edit with nothing left deletes the workout', async () => {
    const { sessionId } = await logWorkout('Barbell_Squat', [[100, 5]])
    const [only] = (await loadSession(sessionId))!.exercises[0].sets
    await uncompleteSet(only.id)
    expect(await saveSessionEdits(sessionId)).toBe(false)
    expect(await loadSession(sessionId)).toBeNull()
  })
})

describe('today', () => {
  it('weekly volume counts weight × reps sets only, not discarded or bodyweight ones', async () => {
    const since = Date.now() - 1
    await logWorkout('Barbell_Squat', [
      [100, 5],
      [100, 5],
    ])
    await setLoggingOverride('Barbell_Bench_Press_-_Medium_Grip', 'bodyweight')
    await logWorkout('Barbell_Bench_Press_-_Medium_Grip', [[20, 10]])

    const discarded = await startSession()
    const seId = await addSessionExercise(discarded, await exercise('Barbell_Squat'))
    const [set] = (await loadSession(discarded))!.exercises.find((e) => e.se.id === seId)!.sets
    await updateSet(set.id, { weightKg: 200, reps: 5 })
    await completeSet(set.id)
    await discardSession(discarded)

    expect(await volumeSinceKg(since)).toBe(1000)
    expect(await finishedSessionStarts()).toHaveLength(2)
  })
})


describe('coach', () => {
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
    reason: '',
    ...c,
  })

  async function apply(planId: string, changes: PlanChange[]) {
    const detail = (await loadPlan(planId))!
    const library = await loadExercises(changes.flatMap((c) => [c.exerciseId ?? '', ...(c.exercises ?? []).map((e) => e.exerciseId)]))
    const checked = checkChanges(changes, detail, library)
    expect(checked.skipped).toEqual([])
    await applyPlanChanges(planId, checked.changes)
    return (await loadPlan(planId))!
  }
  const names = (plan: Awaited<ReturnType<typeof loadPlan>>, day = 0) => plan!.days[day].exercises.map((x) => x.exercise.id)

  it('creates a plan from a proposal, marked as made by Claude', async () => {
    const id = await createPlanFromProposal({
      name: 'Strength',
      goal: 'Get stronger on the big lifts',
      days: [{ name: 'A', focusMuscles: ['quads'], exercises: [{ exerciseId: 'Barbell_Squat', sets: 5, repMin: 5, repMax: 5, restSec: 180 }] }],
    })
    const plan = (await loadPlan(id))!
    expect(plan.plan).toMatchObject({ name: 'Strength', goal: 'Get stronger on the big lifts', createdBy: 'ai', isActive: true })
    expect(plan.days[0].exercises[0].pe).toMatchObject({ exerciseId: 'Barbell_Squat', targetSets: 5, repMin: 5, repMax: 5, restSec: 180 })
  })

  it('swaps, edits, adds and moves exercises in place', async () => {
    const planId = await createPlanFromTemplate(PLAN_TEMPLATES[0])
    const before = names(await loadPlan(planId))
    const after = await apply(planId, [
      change({ op: 'replace_exercise', exercise: 'x1', exerciseId: 'Dumbbell_Bench_Press' }),
      change({ op: 'update_exercise', exercise: 'x2', sets: 5 }),
      change({ op: 'add_exercise', day: 'd1', exerciseId: 'Pushups', sets: 2, repMin: 10, repMax: 20, restSec: 60, position: 1 }),
      change({ op: 'move_exercise', exercise: 'x5', position: 2 }),
    ])
    const ids = names(after)
    expect(ids[0]).toBe('Pushups')
    expect(ids[1]).toBe(before[4])
    expect(ids).toContain('Dumbbell_Bench_Press')
    expect(ids).not.toContain(before[0])
    expect(after.days[0].exercises.map((x) => x.pe.order)).toEqual(ids.map((_, i) => i))
    expect(after.days[0].exercises.find((x) => x.exercise.id === before[1])!.pe.targetSets).toBe(5)
  })

  it('removes and adds days, and skips changes to rows already removed', async () => {
    const planId = await createPlanFromTemplate(PLAN_TEMPLATES[0])
    const after = await apply(planId, [
      change({ op: 'remove_day', day: 'd1' }),
      change({ op: 'remove_exercise', exercise: 'x1' }), // was on the removed day
      change({ op: 'add_day', name: 'Arms', exercises: [{ exerciseId: 'Barbell_Curl', sets: 3, repMin: 8, repMax: 12, restSec: 90 }] }),
      change({ op: 'rename_day', day: 'd2', name: 'Back' }),
      change({ op: 'rename_plan', name: 'PL + arms' }),
    ])
    expect(after.plan.name).toBe('PL + arms')
    expect(after.days.map((d) => d.day.name)).toEqual(['Back', 'Legs', 'Arms'])
    expect(after.days.map((d) => d.day.order)).toEqual([0, 1, 2])
    expect(after.days[2].day.focusMuscles).toEqual(['biceps'])
    // Removed rows are soft-deleted so the removal syncs.
    expect((await db.planExercises.toArray()).filter((r) => r.deletedAt).length).toBeGreaterThan(0)
  })

  it('summarises recent training for the coach', async () => {
    await logWorkout('Barbell_Squat', [
      [100, 5],
      [90, 8],
    ])
    await createPlan('Other plan')
    const summary = await coachTrainingSummary()
    expect(summary.workouts).toBe(1)
    expect(summary.otherPlans).toEqual(['Other plan'])
    expect(summary.lifts[0]).toMatchObject({ weightKg: 100, reps: 5 })
    expect(summary.lifts[0].exercise.id).toBe('Barbell_Squat')
  })
})
