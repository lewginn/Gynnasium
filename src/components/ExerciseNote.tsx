import { useLiveQuery } from 'dexie-react-hooks'
import { Eraser, StickyNote } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { exerciseNote, saveExerciseNote } from '../db/notes'
import { NOTE_MAX_LENGTH } from '../lib/notes'
import { syncNow } from '../sync'
import Sheet from './Sheet'

// Sticky notes on exercises ("Seat 4, grip wide"): shown in every workout with that exercise and on its page.

interface Props {
  exerciseId: string
  exerciseName: string
}

const useNote = (exerciseId: string) => useLiveQuery(() => exerciseNote(exerciseId), [exerciseId])

/**
 * For an exercise card's title row: the note under the name (two lines, then cut off; tap to edit), or a quiet
 * button to add one. The note line wraps onto its own row below the name (see .note-line).
 */
export default function ExerciseNote({ exerciseId, exerciseName }: Props) {
  const note = useNote(exerciseId)
  const [editing, setEditing] = useState(false)
  if (note === undefined) return null
  return (
    <>
      {note ? (
        <button className="note-line" onClick={() => setEditing(true)}>
          <StickyNote size={16} aria-hidden />
          <span className="sr-only">Edit note: </span>
          <span className="note-text">{note.text}</span>
        </button>
      ) : (
        <button className="icon-btn note-add" aria-label={`Add a note to ${exerciseName}`} onClick={() => setEditing(true)}>
          <StickyNote size={20} />
        </button>
      )}
      {editing && <NoteSheet exerciseId={exerciseId} exerciseName={exerciseName} text={note?.text ?? ''} onClose={() => setEditing(false)} />}
    </>
  )
}

/** The note on an exercise's page, in full, with a button to add or edit it. */
export function ExerciseNoteCard({ exerciseId, exerciseName }: Props) {
  const note = useNote(exerciseId)
  const [editing, setEditing] = useState(false)
  if (note === undefined) return null
  return (
    <section className="card" aria-labelledby="note-heading">
      <h2 id="note-heading">Note</h2>
      {note ? <p className="note-full">{note.text}</p> : <p className="muted small">Shown every time you do this exercise, like a seat setting or grip.</p>}
      <button className="btn btn-sm" onClick={() => setEditing(true)}>
        <StickyNote size={18} aria-hidden /> {note ? 'Edit note' : 'Add note'}
      </button>
      {editing && <NoteSheet exerciseId={exerciseId} exerciseName={exerciseName} text={note?.text ?? ''} onClose={() => setEditing(false)} />}
    </section>
  )
}

function NoteSheet({ exerciseId, exerciseName, text, onClose }: Props & { text: string; onClose: () => void }) {
  const [value, setValue] = useState(text)
  const input = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()

  // Ready to type, with the cursor after what's there.
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const save = async (next: string) => {
    await saveExerciseNote(exerciseId, next)
    onClose()
    void syncNow()
  }

  return (
    <Sheet title={exerciseName} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          void save(value)
        }}
      >
        <label className="field">
          <span>Note</span>
          <textarea
            ref={input}
            className="input note-input"
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            placeholder="e.g. Seat 4, grip wide"
            aria-describedby={hintId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <p id={hintId} className="muted small note-hint">
          Shown every time you do this exercise.
        </p>
        <div className="row">
          <button type="button" className="btn grow" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary grow">
            Save
          </button>
        </div>
        {text && (
          <button type="button" className="btn btn-danger-text btn-block" onClick={() => void save('')}>
            <Eraser size={18} aria-hidden /> Clear note
          </button>
        )}
      </form>
    </Sheet>
  )
}
