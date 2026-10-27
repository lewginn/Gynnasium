import type { ExerciseNote } from './types'

/** A note is a line or two ("Seat 4, grip wide"), not a diary. */
export const NOTE_MAX_LENGTH = 200

/** Trims the note and its lines, drops blank lines, and caps the length. Empty means no note. */
export function cleanNote(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, NOTE_MAX_LENGTH)
    .trim()
}

/** Newest first; the id breaks ties so every device picks the same row. */
const newestFirst = (a: ExerciseNote, b: ExerciseNote) => b.updatedAt - a.updatedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)

/**
 * The note shown for an exercise. There's one live note per exercise, but two devices can each create one
 * before they sync: then the most recently updated wins.
 */
export function currentNote(notes: ExerciseNote[], exerciseId: string): ExerciseNote | undefined {
  return notes.filter((n) => n.exerciseId === exerciseId && !n.deletedAt).sort(newestFirst)[0]
}

/**
 * The rows to write when the note for an exercise is saved as `text` (empty clears it).
 * Keeps the current note's id when there is one, and soft-deletes any other live note for the exercise,
 * so duplicates from two devices are tidied up on the next edit. Never a hard delete, so it syncs.
 */
export function noteWrites(notes: ExerciseNote[], exerciseId: string, text: string, now: number, newId: () => string): ExerciseNote[] {
  const live = notes.filter((n) => n.exerciseId === exerciseId && !n.deletedAt).sort(newestFirst)
  const clean = cleanNote(text)
  const [keep, ...others] = live
  const removed = (clean ? others : live).map((n) => ({ ...n, deletedAt: now, updatedAt: now }))
  if (!clean) return removed
  if (keep?.text === clean && others.length === 0) return []
  return [{ ...(keep ?? { id: newId(), exerciseId }), text: clean, updatedAt: now }, ...removed]
}
