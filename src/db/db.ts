import Dexie, { type EntityTable } from 'dexie'
import type {
  BodyMetric,
  Exercise,
  Plan,
  PlanDay,
  PlanExercise,
  SessionExercise,
  SetLog,
  WorkoutSession,
} from '../lib/types'

interface KeyValue {
  key: string
  value: unknown
}

/**
 * Local-first store: every read and write in the app hits IndexedDB, so the UI never waits on the network.
 * Synced tables mirror supabase/migrations; `updatedAt` / `deletedAt` drive the (later) sync.
 */
export class GymDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  plans!: EntityTable<Plan, 'id'>
  planDays!: EntityTable<PlanDay, 'id'>
  planExercises!: EntityTable<PlanExercise, 'id'>
  sessions!: EntityTable<WorkoutSession, 'id'>
  sessionExercises!: EntityTable<SessionExercise, 'id'>
  setLogs!: EntityTable<SetLog, 'id'>
  bodyMetrics!: EntityTable<BodyMetric, 'id'>
  kv!: EntityTable<KeyValue, 'key'>

  constructor(name = 'gynnasium') {
    super(name)
    this.version(1).stores({
      exercises: 'id, name, *primaryMuscles, region, movementPattern, equipment',
      plans: 'id, updatedAt',
      planDays: 'id, planId, updatedAt',
      planExercises: 'id, planDayId, updatedAt',
      sessions: 'id, startedAt, planDayId, updatedAt',
      sessionExercises: 'id, sessionId, exerciseId, updatedAt',
      setLogs: 'id, sessionExerciseId, [exerciseId+completedAt], updatedAt',
      bodyMetrics: 'id, [type+date], updatedAt',
      kv: 'key',
    })
  }
}

export const db = new GymDB()

/** Bump when src/data/exercises.json is regenerated so existing installs pick up the new library. */
export const LIBRARY_VERSION = 2

export async function ensureExerciseLibrary(database: GymDB = db): Promise<void> {
  const current = await database.kv.get('libraryVersion')
  if (current?.value === LIBRARY_VERSION) return
  // Loaded lazily so the library isn't part of the main bundle.
  const { default: library } = await import('../data/exercises.json')
  await database.transaction('rw', database.exercises, database.kv, async () => {
    // Custom exercises are kept; only the bundled library is replaced.
    await database.exercises.filter((e) => !e.isCustom).delete()
    await database.exercises.bulkPut(library as Exercise[])
    await database.kv.put({ key: 'libraryVersion', value: LIBRARY_VERSION })
  })
}
