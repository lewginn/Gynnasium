import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { GymDB } from '../db/db'
import { exerciseNote, saveExerciseNote } from '../db/notes'
import type { Row } from './mapping'
import { syncOnce, type Remote } from './engine'

/** In-memory stand-in for Supabase: tables keyed by id, with a server clock for pull cursors. */
class FakeRemote implements Remote {
  tables = new Map<string, Map<string, Row>>()
  settings: Row | null = null
  private clock = 0
  upserts = 0

  private table(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map())
    return this.tables.get(name)!
  }
  private stamp() {
    return new Date(Date.UTC(2026, 0, 1) + ++this.clock).toISOString()
  }
  async upsert(name: string, rows: Row[]) {
    this.upserts++
    for (const r of rows) {
      const existing = this.table(name).get(r.id as string)
      // Like the server trigger: a write older than what's stored is ignored.
      if (existing && (existing.updated_at as string) > (r.updated_at as string)) continue
      this.table(name).set(r.id as string, { ...existing, ...r, server_updated_at: this.stamp() })
    }
  }
  async pull(name: string, since: string | null, limit: number) {
    return [...this.table(name).values()]
      .filter((r) => !since || (r.server_updated_at as string) > since)
      .sort((a, b) => (a.server_updated_at as string).localeCompare(b.server_updated_at as string))
      .slice(0, limit)
  }
  async getSettings() {
    return this.settings
  }
  async putSettings(row: Row) {
    this.settings = row
  }
}

let n = 0
const phone = () => new GymDB(`sync-test-${++n}`)
/** Realistic timestamps: the app stamps rows with Date.now(), and pushes rows changed since the last push. */
const at = (offsetMs: number) => Date.now() + offsetMs

describe('sync', () => {
  let remote: FakeRemote
  beforeEach(() => {
    remote = new FakeRemote()
  })

  it('a workout logged on one device appears on another', async () => {
    const a = phone()
    const b = phone()
    await a.sessions.add({ id: 's1', name: 'Push', startedAt: 1000, endedAt: 2000, updatedAt: 2000 })
    await a.sessionExercises.add({ id: 'se1', sessionId: 's1', exerciseId: 'Pullups', order: 0, updatedAt: 2000 })
    await a.setLogs.add({
      id: 'set1',
      sessionExerciseId: 'se1',
      exerciseId: 'Pullups',
      setNumber: 1,
      setType: 'working',
      weightKg: 10,
      reps: 8,
      completedAt: 1500,
      prs: ['max_weight'],
      updatedAt: 2000,
    })

    await syncOnce(remote, 'user-1', a)
    const sent = remote.tables.get('set_logs')!.get('set1')!
    expect(sent).toMatchObject({ weight_kg: 10, reps: 8, completed_at: new Date(1500).toISOString(), duration_sec: null, prs: ['max_weight'] })

    await syncOnce(remote, 'user-1', b)
    expect(await b.setLogs.get('set1')).toEqual(await a.setLogs.get('set1'))
    expect(await b.sessions.get('s1')).toEqual(await a.sessions.get('s1'))
  })

  it('only pushes what changed since the last sync', async () => {
    const a = phone()
    await a.plans.add({ id: 'p1', name: 'PPL', isActive: true, createdBy: 'manual', updatedAt: Date.now() })
    await syncOnce(remote, 'u', a)
    const before = remote.upserts
    await syncOnce(remote, 'u', a)
    expect(remote.upserts).toBe(before)
    await a.plans.update('p1', { name: 'PPL v2', updatedAt: Date.now() })
    await syncOnce(remote, 'u', a)
    expect(remote.upserts).toBe(before + 1)
    expect(remote.tables.get('plans')!.get('p1')!.name).toBe('PPL v2')
  })

  it('newest edit wins; an older remote copy never overwrites a newer local one', async () => {
    const a = phone()
    const b = phone()
    await a.plans.add({ id: 'p1', name: 'Old', isActive: true, createdBy: 'manual', updatedAt: at(0) })
    await syncOnce(remote, 'u', a)
    await syncOnce(remote, 'u', b)

    await b.plans.update('p1', { name: 'Edited on B', updatedAt: at(3000) })
    await a.plans.update('p1', { name: 'Edited on A earlier', updatedAt: at(2000) })
    await syncOnce(remote, 'u', b)
    await syncOnce(remote, 'u', a) // pushes A's older edit, then pulls…
    await syncOnce(remote, 'u', b)
    await syncOnce(remote, 'u', a)
    // The server took A's push last, but B keeps its newer edit, and once B re-pushes, A converges to it.
    expect((await b.plans.get('p1'))!.name).toBe('Edited on B')
    expect((await a.plans.get('p1'))!.name).toBe('Edited on B')
  })

  it('deletes and cleared fields sync', async () => {
    const a = phone()
    const b = phone()
    await a.setLogs.add({ id: 's', sessionExerciseId: 'se', exerciseId: 'x', setNumber: 1, setType: 'working', weightKg: 50, reps: 5, completedAt: at(0), updatedAt: at(0) })
    await syncOnce(remote, 'u', a)
    await syncOnce(remote, 'u', b)

    // Un-tick on A: completedAt is removed locally and must be cleared remotely, then delete it.
    await a.setLogs.where('id').equals('s').modify((s) => {
      delete s.completedAt
      s.updatedAt = at(1000)
    })
    await syncOnce(remote, 'u', a)
    await syncOnce(remote, 'u', b)
    expect((await b.setLogs.get('s'))!.completedAt).toBeUndefined()

    const deletedAt = at(2000)
    await a.setLogs.update('s', { deletedAt, updatedAt: deletedAt })
    await syncOnce(remote, 'u', a)
    await syncOnce(remote, 'u', b)
    expect((await b.setLogs.get('s'))!.deletedAt).toBe(deletedAt)
  })

  it('settings and "log as" overrides sync, newest wins', async () => {
    const a = phone()
    const b = phone()
    await a.kv.bulkPut([
      { key: 'settings', value: { units: 'lb', defaultRestSec: 90, showRpe: true } },
      { key: 'loggingOverrides', value: { Leg_Press: 'time' } },
      { key: 'settingsUpdatedAt', value: at(0) },
    ])
    await syncOnce(remote, 'u', a)
    await syncOnce(remote, 'u', b)
    expect((await b.kv.get('settings'))!.value).toMatchObject({ units: 'lb', defaultRestSec: 90, showRpe: true })
    expect((await b.kv.get('loggingOverrides'))!.value).toEqual({ Leg_Press: 'time' })
  })

  it('pages through large histories', async () => {
    const a = phone()
    const b = phone()
    await a.bodyMetrics.bulkAdd(
      Array.from({ length: 1234 }, (_, i) => ({ id: `m${i}`, type: 'bodyweight' as const, value: 80, date: '2026-01-01', source: 'manual' as const, updatedAt: 1 + i })),
    )
    await syncOnce(remote, 'u', a)
    await syncOnce(remote, 'u', b)
    expect(await b.bodyMetrics.count()).toBe(1234)
  })

  it('exercise notes sync; when two devices each add one, both show the newest, and clearing syncs', async () => {
    const a = phone()
    const b = phone()
    await saveExerciseNote('Barbell_Squat', 'Seat 4', a)
    await new Promise((r) => setTimeout(r, 2))
    await saveExerciseNote('Barbell_Squat', 'Grip wide', b) // made offline on the other device, a little later
    await syncOnce(remote, 'u', a)
    await syncOnce(remote, 'u', b)
    await syncOnce(remote, 'u', a)
    expect((await exerciseNote('Barbell_Squat', a))?.text).toBe('Grip wide')
    expect((await exerciseNote('Barbell_Squat', b))?.text).toBe('Grip wide')
    expect(remote.tables.get('exercise_notes')!.get((await exerciseNote('Barbell_Squat', a))!.id)).toMatchObject({ exercise_id: 'Barbell_Squat', text: 'Grip wide' })

    await saveExerciseNote('Barbell_Squat', '', a)
    await syncOnce(remote, 'u', a)
    await syncOnce(remote, 'u', b)
    expect(await exerciseNote('Barbell_Squat', b)).toBeNull()
    expect([...remote.tables.get('exercise_notes')!.values()].every((r) => r.deleted_at)).toBe(true)
  })

  it('signing in as someone else starts sync from scratch', async () => {
    const a = phone()
    await a.plans.add({ id: 'p1', name: 'PPL', isActive: true, createdBy: 'manual', updatedAt: 1 })
    await syncOnce(remote, 'user-1', a)
    const other = new FakeRemote()
    await syncOnce(other, 'user-2', a)
    expect(other.tables.get('plans')!.has('p1')).toBe(true)
  })
})
