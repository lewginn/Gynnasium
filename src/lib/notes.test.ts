import { describe, expect, it } from 'vitest'
import { NOTE_MAX_LENGTH, cleanNote, currentNote, noteWrites } from './notes'
import type { ExerciseNote } from './types'

const note = (id: string, text: string, updatedAt: number, extra: Partial<ExerciseNote> = {}): ExerciseNote => ({
  id,
  exerciseId: 'Barbell_Squat',
  text,
  updatedAt,
  ...extra,
})
let n = 0
const newId = () => `new-${++n}`

describe('cleanNote', () => {
  it('trims lines, drops blank ones and caps the length', () => {
    expect(cleanNote('  Seat 4  \n\n   grip wide \n')).toBe('Seat 4\ngrip wide')
    expect(cleanNote('   \n ')).toBe('')
    expect(cleanNote('x'.repeat(NOTE_MAX_LENGTH + 50))).toHaveLength(NOTE_MAX_LENGTH)
  })
})

describe('currentNote', () => {
  it("is the exercise's live note", () => {
    const notes = [note('a', 'Seat 4', 1), note('b', 'Left stack', 5, { exerciseId: 'Cable_Row' })]
    expect(currentNote(notes, 'Barbell_Squat')?.text).toBe('Seat 4')
    expect(currentNote(notes, 'Cable_Row')?.text).toBe('Left stack')
    expect(currentNote(notes, 'Deadlift')).toBeUndefined()
  })

  it('ignores cleared notes', () => {
    expect(currentNote([note('a', 'Seat 4', 2, { deletedAt: 2 })], 'Barbell_Squat')).toBeUndefined()
  })

  it('when two devices each made one, shows the most recently updated, the same on every device', () => {
    const a = note('a', 'From the phone', 10)
    const b = note('b', 'From the laptop', 20)
    expect(currentNote([a, b], 'Barbell_Squat')?.text).toBe('From the laptop')
    expect(currentNote([b, a], 'Barbell_Squat')?.text).toBe('From the laptop')
    const tie = note('c', 'Same time', 20)
    expect(currentNote([b, tie], 'Barbell_Squat')?.id).toBe(currentNote([tie, b], 'Barbell_Squat')?.id)
  })
})

describe('noteWrites', () => {
  it('creates a note when there is none', () => {
    expect(noteWrites([], 'Barbell_Squat', ' Seat 4 ', 100, () => 'id-1')).toEqual([{ id: 'id-1', exerciseId: 'Barbell_Squat', text: 'Seat 4', updatedAt: 100 }])
  })

  it('edits the existing note in place', () => {
    expect(noteWrites([note('a', 'Seat 4', 1)], 'Barbell_Squat', 'Seat 5', 100, newId)).toEqual([note('a', 'Seat 5', 100)])
  })

  it('writes nothing when the text is unchanged', () => {
    expect(noteWrites([note('a', 'Seat 4', 1)], 'Barbell_Squat', 'Seat 4 ', 100, newId)).toEqual([])
    expect(noteWrites([], 'Barbell_Squat', '  ', 100, newId)).toEqual([])
  })

  it('clearing soft-deletes the note', () => {
    expect(noteWrites([note('a', 'Seat 4', 1)], 'Barbell_Squat', '', 100, newId)).toEqual([note('a', 'Seat 4', 100, { deletedAt: 100 })])
  })

  it('a cleared note is not brought back: a new one gets a new id', () => {
    expect(noteWrites([note('a', 'Old', 1, { deletedAt: 1 })], 'Barbell_Squat', 'New', 100, () => 'id-2')).toEqual([
      { id: 'id-2', exerciseId: 'Barbell_Squat', text: 'New', updatedAt: 100 },
    ])
  })

  it('tidies up a duplicate from another device: keeps the newest, soft-deletes the rest', () => {
    const notes = [note('a', 'From the phone', 10), note('b', 'From the laptop', 20), note('c', 'Other exercise', 5, { exerciseId: 'Deadlift' })]
    expect(noteWrites(notes, 'Barbell_Squat', 'From the laptop', 100, newId)).toEqual([
      note('b', 'From the laptop', 100),
      note('a', 'From the phone', 100, { deletedAt: 100 }),
    ])
    expect(noteWrites(notes, 'Barbell_Squat', '', 100, newId).map((w) => [w.id, w.deletedAt])).toEqual([
      ['b', 100],
      ['a', 100],
    ])
  })
})
