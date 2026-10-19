import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import type { PRType } from '../lib/prs'
import type { Exercise, SessionExercise, SetLog, WorkoutSession } from '../lib/types'
import { lastSessionSets, sessionPRs, workoutName } from '../lib/workout'
import { db, type GymDB } from './db'

const alive = <T extends { deletedAt?: number }>(row: T) => !row.deletedAt

export async function getActiveSession(database: GymDB = db): Promise<WorkoutSession | undefined> {
  const open = await database.sessions.filter((s) => !s.endedAt && !s.deletedAt).toArray()
  return open.sort((a, b) => b.startedAt - a.startedAt)[0]
}

/** The workout in progress: undefined while loading, null when there isn't one. */
export function useActiveSession(): WorkoutSession | null | undefined {
  return useLiveQuery(async () => (await getActiveSession()) ?? null)
}

/** Starts a workout, or returns the one already in progress. */
export async function startWorkout(database: GymDB = db, now = Date.now()): Promise<WorkoutSession> {
  return database.transaction('rw', database.sessions, async () => {
    const existing = await getActiveSession(database)
    if (existing) return existing
    const session: WorkoutSession = { id: crypto.randomUUID(), name: workoutName(new Date(now)), startedAt: now, updatedAt: now }
    await database.sessions.add(session)
    return session
  })
}

async function sessionExercisesOf(sessionId: string, database: GymDB) {
  const rows = await database.sessionExercises.where('sessionId').equals(sessionId).toArray()
  return rows.filter(alive).sort((a, b) => a.order - b.order)
}

async function setsOf(sessionExerciseIds: string[], database: GymDB) {
  const rows = await database.setLogs.where('sessionExerciseId').anyOf(sessionExerciseIds).toArray()
  return rows.filter(alive).sort((a, b) => a.setNumber - b.setNumber)
}

export async function addExercise(
  sessionId: string,
  exerciseId: string,
  database: GymDB = db,
  now = Date.now(),
): Promise<SessionExercise> {
  return database.transaction('rw', database.sessionExercises, async () => {
    const existing = await sessionExercisesOf(sessionId, database)
    const row: SessionExercise = {
      id: crypto.randomUUID(),
      sessionId,
      exerciseId,
      order: Math.max(-1, ...existing.map((e) => e.order)) + 1,
      updatedAt: now,
    }
    await database.sessionExercises.add(row)
    return row
  })
}

export async function removeExercise(sessionExerciseId: string, database: GymDB = db, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.sessionExercises, database.setLogs, async () => {
    await database.sessionExercises.update(sessionExerciseId, { deletedAt: now, updatedAt: now })
    await database.setLogs.where('sessionExerciseId').equals(sessionExerciseId).modify({ deletedAt: now, updatedAt: now })
  })
}

type SetInput = Pick<SetLog, 'weightKg' | 'reps' | 'rpe'>

export async function logSet(
  sessionExercise: Pick<SessionExercise, 'id' | 'exerciseId'>,
  input: SetInput,
  database: GymDB = db,
  now = Date.now(),
): Promise<SetLog> {
  return database.transaction('rw', database.setLogs, async () => {
    const done = await setsOf([sessionExercise.id], database)
    const set: SetLog = {
      id: crypto.randomUUID(),
      sessionExerciseId: sessionExercise.id,
      exerciseId: sessionExercise.exerciseId,
      setNumber: done.length + 1,
      setType: 'working',
      weightKg: input.weightKg,
      reps: input.reps,
      ...(input.rpe !== undefined && { rpe: input.rpe }),
      completedAt: now,
      updatedAt: now,
    }
    await database.setLogs.add(set)
    return set
  })
}

export async function updateSet(id: string, input: SetInput, database: GymDB = db, now = Date.now()): Promise<void> {
  await database.setLogs.update(id, { ...input, updatedAt: now })
}

/** Soft-deletes a set and renumbers the rest of that exercise's sets. */
export async function deleteSet(id: string, database: GymDB = db, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.setLogs, async () => {
    const set = await database.setLogs.get(id)
    if (!set) return
    await database.setLogs.update(id, { deletedAt: now, updatedAt: now })
    const rest = await setsOf([set.sessionExerciseId], database)
    await Promise.all(
      rest.map((s, i) => (s.setNumber === i + 1 ? null : database.setLogs.update(s.id, { setNumber: i + 1, updatedAt: now }))),
    )
  })
}

export async function finishWorkout(sessionId: string, database: GymDB = db, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.sessions, database.kv, async () => {
    await database.sessions.update(sessionId, { endedAt: now, updatedAt: now })
    await database.kv.delete(REST_KEY)
  })
}

export async function discardWorkout(sessionId: string, database: GymDB = db, now = Date.now()): Promise<void> {
  await database.transaction('rw', [database.sessions, database.sessionExercises, database.setLogs, database.kv], async () => {
    const exercises = await sessionExercisesOf(sessionId, database)
    for (const e of exercises) await removeExercise(e.id, database, now)
    await database.sessions.update(sessionId, { deletedAt: now, updatedAt: now })
    await database.kv.delete(REST_KEY)
  })
}

/** Every set of an exercise logged before `before` (ms epoch). */
export async function historyBefore(exerciseId: string, before: number, database: GymDB = db): Promise<SetLog[]> {
  const rows = await database.setLogs
    .where('[exerciseId+completedAt]')
    .between([exerciseId, Dexie.minKey], [exerciseId, before], true, false)
    .toArray()
  return rows.filter(alive)
}

export interface WorkoutItem {
  sessionExercise: SessionExercise
  exercise: Exercise | undefined
  sets: SetLog[]
  /** The same exercise's sets from the last time it was done. */
  previous: SetLog[]
}

export interface WorkoutData {
  session: WorkoutSession
  items: WorkoutItem[]
  prs: Map<string, PRType[]>
}

export async function loadWorkout(sessionId: string, database: GymDB = db): Promise<WorkoutData | null> {
  const session = await database.sessions.get(sessionId)
  if (!session || session.deletedAt) return null
  const sessionExercises = await sessionExercisesOf(sessionId, database)
  const [exercises, sets] = await Promise.all([
    database.exercises.bulkGet(sessionExercises.map((e) => e.exerciseId)),
    setsOf(
      sessionExercises.map((e) => e.id),
      database,
    ),
  ])
  const history = new Map<string, SetLog[]>()
  for (const id of new Set(sessionExercises.map((e) => e.exerciseId))) {
    history.set(id, await historyBefore(id, session.startedAt, database))
  }
  const items = sessionExercises.map((sessionExercise, i) => ({
    sessionExercise,
    exercise: exercises[i],
    sets: sets.filter((s) => s.sessionExerciseId === sessionExercise.id),
    previous: lastSessionSets(history.get(sessionExercise.exerciseId) ?? []),
  }))
  return { session, items, prs: sessionPRs(sets, history) }
}

export function useWorkout(sessionId: string | undefined): WorkoutData | null | undefined {
  return useLiveQuery(async () => (sessionId ? loadWorkout(sessionId) : null), [sessionId])
}

/** Exercises from recent workouts, most recent first, for quick re-adding. */
export async function recentExerciseIds(limit = 8, database: GymDB = db): Promise<string[]> {
  const rows = await database.sessionExercises.orderBy('updatedAt').reverse().filter(alive).toArray()
  return [...new Set(rows.map((r) => r.exerciseId))].slice(0, limit)
}

export interface FinishedWorkout {
  session: WorkoutSession
  setCount: number
}

export function useRecentWorkouts(limit = 5): FinishedWorkout[] | undefined {
  return useLiveQuery(async () => {
    const sessions = await db.sessions.orderBy('startedAt').reverse().filter((s) => !!s.endedAt && !s.deletedAt).limit(limit).toArray()
    return Promise.all(
      sessions.map(async (session) => {
        const ids = (await sessionExercisesOf(session.id, db)).map((e) => e.id)
        return { session, setCount: (await setsOf(ids, db)).length }
      }),
    )
  }, [limit])
}

// Rest timer. Stored as an end time so it survives reloads and keeps counting while the screen is off.
const REST_KEY = 'restTimer'

export interface RestTimer {
  endsAt: number
  durationMs: number
}

export async function startRest(seconds: number, database: GymDB = db, now = Date.now()): Promise<void> {
  const timer: RestTimer = { endsAt: now + seconds * 1000, durationMs: seconds * 1000 }
  await database.kv.put({ key: REST_KEY, value: timer })
}

export async function adjustRest(deltaSeconds: number, database: GymDB = db, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.kv, async () => {
    const timer = (await database.kv.get(REST_KEY))?.value as RestTimer | undefined
    if (!timer) return
    const endsAt = Math.max(now, timer.endsAt + deltaSeconds * 1000)
    await database.kv.put({ key: REST_KEY, value: { endsAt, durationMs: Math.max(1000, timer.durationMs + deltaSeconds * 1000) } })
  })
}

export async function clearRest(database: GymDB = db): Promise<void> {
  await database.kv.delete(REST_KEY)
}

export function useRestTimer(): RestTimer | null | undefined {
  return useLiveQuery(async () => ((await db.kv.get(REST_KEY))?.value as RestTimer | undefined) ?? null)
}
