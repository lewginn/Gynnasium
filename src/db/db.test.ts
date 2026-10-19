import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import library from '../data/exercises.json'
import type { Exercise } from '../lib/types'
import { GymDB, ensureExerciseLibrary } from './db'

describe('exercise library', () => {
  it('seeds once and keeps custom exercises on reseed', async () => {
    const db = new GymDB('test-seed')
    await ensureExerciseLibrary(db)
    expect(await db.exercises.count()).toBe(library.length)

    await db.exercises.put({ ...(library[0] as Exercise), id: 'custom-1', name: 'My Machine Row', isCustom: true })
    await db.kv.put({ key: 'libraryVersion', value: 0 }) // simulate an older library
    await ensureExerciseLibrary(db)

    expect(await db.exercises.count()).toBe(library.length + 1)
    expect((await db.exercises.get('custom-1'))?.name).toBe('My Machine Row')
  })

  it('library entries are well formed', () => {
    const ids = new Set<string>()
    for (const e of library) {
      expect(e.primaryMuscles.length).toBeGreaterThan(0)
      expect(ids.has(e.id)).toBe(false)
      ids.add(e.id)
    }
  })
})
