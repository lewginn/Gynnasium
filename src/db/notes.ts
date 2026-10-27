import { currentNote, noteWrites } from '../lib/notes'
import type { ExerciseNote } from '../lib/types'
import { db, type GymDB } from './db'

// Sticky notes on exercises. Kept out of repo.ts so the feature stays in one place.

/** The note shown for an exercise, or null when it has none. */
export async function exerciseNote(exerciseId: string, database: GymDB = db): Promise<ExerciseNote | null> {
  return currentNote(await database.exerciseNotes.where('exerciseId').equals(exerciseId).toArray(), exerciseId) ?? null
}

/** Saves the note for an exercise; empty text clears it (a soft delete, so it syncs). */
export async function saveExerciseNote(exerciseId: string, text: string, database: GymDB = db): Promise<void> {
  await database.transaction('rw', database.exerciseNotes, async () => {
    const notes = await database.exerciseNotes.where('exerciseId').equals(exerciseId).toArray()
    const writes = noteWrites(notes, exerciseId, text, Date.now(), () => crypto.randomUUID())
    if (writes.length) await database.exerciseNotes.bulkPut(writes)
  })
}
