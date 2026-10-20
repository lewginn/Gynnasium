import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { GymDB, ensureExerciseLibrary } from '../db/db'
import { claimDevice } from './account'

let n = 0
async function phoneWithData() {
  const db = new GymDB(`account-test-${++n}`)
  await ensureExerciseLibrary(db)
  await db.plans.add({ id: 'p1', name: 'PPL', isActive: true, createdBy: 'manual', updatedAt: 1 })
  await db.bodyMetrics.add({ id: 'm1', type: 'bodyweight', value: 80, date: '2026-01-01', source: 'manual', updatedAt: 1 })
  await db.goals.add({ id: 'g1', name: 'Holiday', startsOn: '2026-01-01', targetDate: '2026-08-01', targets: [], isActive: true, updatedAt: 1 })
  await db.daysOff.add({ id: 'o1', date: '2026-02-01', updatedAt: 1 })
  await db.kv.put({ key: 'settings', value: { units: 'lb' } })
  return db
}

describe('claimDevice', () => {
  it('adopts data logged before signing in', async () => {
    const db = await phoneWithData()
    expect(await claimDevice('me', db)).toBe('adopted')
    expect(await db.plans.count()).toBe(1)
    expect((await db.kv.get('settings'))!.value).toEqual({ units: 'lb' })
  })

  it('keeps everything when the same person signs back in', async () => {
    const db = await phoneWithData()
    await claimDevice('me', db)
    expect(await claimDevice('me', db)).toBe('kept')
    expect(await db.plans.count()).toBe(1)
  })

  it("clears the previous account's data when someone else signs in, but keeps the exercise library", async () => {
    const db = await phoneWithData()
    await claimDevice('me', db)
    const library = await db.exercises.count()
    expect(await claimDevice('friend', db)).toBe('switched')
    expect(await db.plans.count()).toBe(0)
    expect(await db.bodyMetrics.count()).toBe(0)
    expect(await db.goals.count()).toBe(0)
    expect(await db.daysOff.count()).toBe(0)
    expect(await db.kv.get('settings')).toBeUndefined()
    expect(await db.exercises.count()).toBe(library)
    expect((await db.kv.get('libraryVersion'))?.value).toBeDefined()
    expect((await db.kv.get('ownerUserId'))?.value).toBe('friend')
  })
})
