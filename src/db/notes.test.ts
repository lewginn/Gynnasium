import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { GymDB } from './db'
import { exerciseNote, saveExerciseNote } from './notes'

let n = 0
const fresh = () => new GymDB(`notes-test-${++n}`)

describe('exercise notes', () => {
  it('adds, edits and clears a note, soft-deleting so the clear syncs', async () => {
    const db = fresh()
    expect(await exerciseNote('Barbell_Squat', db)).toBeNull()

    await saveExerciseNote('Barbell_Squat', 'Seat 4, grip wide', db)
    const added = await exerciseNote('Barbell_Squat', db)
    expect(added).toMatchObject({ exerciseId: 'Barbell_Squat', text: 'Seat 4, grip wide' })

    await saveExerciseNote('Barbell_Squat', 'Seat 5', db)
    const edited = await exerciseNote('Barbell_Squat', db)
    expect(edited).toMatchObject({ id: added!.id, text: 'Seat 5' })
    expect(edited!.updatedAt).toBeGreaterThanOrEqual(added!.updatedAt)

    await saveExerciseNote('Barbell_Squat', '  ', db)
    expect(await exerciseNote('Barbell_Squat', db)).toBeNull()
    const rows = await db.exerciseNotes.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].deletedAt).toBeTruthy()
  })

  it('keeps notes per exercise', async () => {
    const db = fresh()
    await saveExerciseNote('Barbell_Squat', 'Seat 4', db)
    await saveExerciseNote('Cable_Row', 'Left stack', db)
    expect((await exerciseNote('Barbell_Squat', db))?.text).toBe('Seat 4')
    expect((await exerciseNote('Cable_Row', db))?.text).toBe('Left stack')
  })

  it('with a duplicate synced from another device, shows the newest and tidies up on the next save', async () => {
    const db = fresh()
    await db.exerciseNotes.bulkAdd([
      { id: 'phone', exerciseId: 'Barbell_Squat', text: 'From the phone', updatedAt: 10 },
      { id: 'laptop', exerciseId: 'Barbell_Squat', text: 'From the laptop', updatedAt: 20 },
    ])
    expect((await exerciseNote('Barbell_Squat', db))?.id).toBe('laptop')

    await saveExerciseNote('Barbell_Squat', 'Seat 4', db)
    expect(await exerciseNote('Barbell_Squat', db)).toMatchObject({ id: 'laptop', text: 'Seat 4' })
    expect((await db.exerciseNotes.get('phone'))?.deletedAt).toBeTruthy()
  })
})
