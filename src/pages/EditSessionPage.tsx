import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ExerciseCard from '../components/ExerciseCard'
import ExercisePicker from '../components/ExercisePicker'
import { db } from '../db/db'
import { addSessionExercise, discardSession, loadSession, saveSessionEdits } from '../db/repo'
import { useSettings } from '../db/settings'
import { syncNow } from '../sync'
import { formatDay } from '../lib/format'
import { useConfirm } from '../state/confirm'

/**
 * Editing a finished workout: fix a typo, add a forgotten set, remove something, or delete the whole workout.
 * Uses the same cards as a live workout, minus the rest timer. PRs are re-checked across history on save.
 */
export default function EditSessionPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const settings = useSettings()
  const detail = useLiveQuery(async () => (await loadSession(sessionId)) ?? null, [sessionId])
  const library = useLiveQuery(() => db.exercises.toArray())
  const [picking, setPicking] = useState(false)

  if (detail === undefined) return <p className="muted">Loading…</p>
  if (detail === null)
    return (
      <section className="card">
        <h2>Workout not found</h2>
        <Link to="/progress">Back to history</Link>
      </section>
    )

  const { session, exercises } = detail

  const save = async () => {
    const pending = exercises.flatMap((e) => e.sets).filter((s) => !s.completedAt).length
    if (pending > 0 && !(await confirm({ title: 'Save changes?', message: `${pending} unticked ${pending === 1 ? 'set is' : 'sets are'} left out.`, action: 'Save' }))) return
    const kept = await saveSessionEdits(session.id)
    void syncNow()
    navigate(kept ? `/history/${session.id}` : '/progress', { replace: true })
  }

  return (
    <div className="workout">
      <header className="workout-header">
        <div className="grow">
          <h1>Edit {session.name}</h1>
          <span className="muted small">{formatDay(session.startedAt)}</span>
        </div>
        <button className="btn btn-primary" onClick={save}>
          Save
        </button>
      </header>
      <p className="muted small">Change anything below. Untick a set to leave it out; tick new ones to keep them.</p>

      {exercises.map((entry, i) => (
        <ExerciseCard
          key={entry.se.id}
          entry={entry}
          first={i === 0}
          last={i === exercises.length - 1}
          sessionId={session.id}
          settings={settings}
          library={library ?? []}
          showLastTime={false}
          onSetDone={() => {}}
        />
      ))}

      <button className="btn btn-block" onClick={() => setPicking(true)}>
        <Plus size={20} aria-hidden /> Add exercise
      </button>
      <button
        className="btn btn-danger-text btn-block btn-sm"
        onClick={async () => {
          if (!(await confirm({ title: `Delete ${session.name}?`, message: 'This can’t be undone.', action: 'Delete workout', destructive: true }))) return
          await discardSession(session.id)
          navigate('/progress', { replace: true })
        }}
      >
        Delete workout
      </button>

      {picking && (
        <ExercisePicker
          title="Add exercise"
          onClose={() => setPicking(false)}
          onPick={(e) => addSessionExercise(session.id, e)}
          excludeIds={exercises.map((e) => e.exercise.id)}
        />
      )}
    </div>
  )
}
