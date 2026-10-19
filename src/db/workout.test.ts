import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { GymDB } from './db'
import {
  addExercise,
  adjustRest,
  deleteSet,
  discardWorkout,
  finishWorkout,
  getActiveSession,
  loadWorkout,
  logSet,
  startRest,
  startWorkout,
} from './workout'

let n = 0
const freshDb = () => new GymDB(`test-workout-${n++}`)

describe('workout session', () => {
  it('starts one workout at a time', async () => {
    const db = freshDb()
    const a = await startWorkout(db, 1000)
    const b = await startWorkout(db, 2000)
    expect(b.id).toBe(a.id)
    await finishWorkout(a.id, db, 3000)
    expect(await getActiveSession(db)).toBeUndefined()
  })

  it('logs sets, numbers them, and renumbers after a delete', async () => {
    const db = freshDb()
    const session = await startWorkout(db, 1000)
    const bench = await addExercise(session.id, 'bench', db, 1000)
    const s1 = await logSet(bench, { weightKg: 60, reps: 8 }, db, 1100)
    await logSet(bench, { weightKg: 62.5, reps: 8 }, db, 1200)
    await logSet(bench, { weightKg: 65, reps: 6, rpe: 9 }, db, 1300)
    await deleteSet(s1.id, db, 1400)

    const data = await loadWorkout(session.id, db)
    expect(data!.items[0].sets.map((s) => [s.setNumber, s.weightKg])).toEqual([
      [1, 62.5],
      [2, 65],
    ])
    expect(data!.items[0].sets[1].rpe).toBe(9)
  })

  it('pre-loads last session and flags PRs against it', async () => {
    const db = freshDb()
    const first = await startWorkout(db, 1000)
    const se1 = await addExercise(first.id, 'bench', db, 1000)
    await logSet(se1, { weightKg: 80, reps: 8 }, db, 1100)
    await logSet(se1, { weightKg: 80, reps: 7 }, db, 1200)
    await finishWorkout(first.id, db, 2000)

    const second = await startWorkout(db, 5000)
    const se2 = await addExercise(second.id, 'bench', db, 5000)
    const pr = await logSet(se2, { weightKg: 82.5, reps: 8 }, db, 5100)

    const data = await loadWorkout(second.id, db)
    expect(data!.items[0].previous.map((s) => s.reps)).toEqual([8, 7])
    expect(data!.prs.get(pr.id)).toContain('max_weight')
  })

  it('discarding hides the workout and its sets from history', async () => {
    const db = freshDb()
    const session = await startWorkout(db, 1000)
    const se = await addExercise(session.id, 'bench', db, 1000)
    await logSet(se, { weightKg: 100, reps: 5 }, db, 1100)
    await discardWorkout(session.id, db, 1200)

    expect(await loadWorkout(session.id, db)).toBeNull()
    const next = await startWorkout(db, 5000)
    await addExercise(next.id, 'bench', db, 5000)
    expect((await loadWorkout(next.id, db))!.items[0].previous).toEqual([])
  })
})

describe('rest timer', () => {
  it('adjusts but never goes below now', async () => {
    const db = freshDb()
    await startRest(90, db, 0)
    await adjustRest(15, db, 0)
    expect((await db.kv.get('restTimer'))?.value).toEqual({ endsAt: 105_000, durationMs: 105_000 })
    await adjustRest(-200, db, 10_000)
    expect(((await db.kv.get('restTimer'))?.value as { endsAt: number }).endsAt).toBe(10_000)
  })
})
