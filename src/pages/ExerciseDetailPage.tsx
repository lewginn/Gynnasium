import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { EQUIPMENT_LABELS, MUSCLE_LABELS, PATTERN_LABELS } from '../lib/labels'

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

export default function ExerciseDetailPage() {
  const { id = '' } = useParams()
  const exercise = useLiveQuery(async () => (await db.exercises.get(id)) ?? null, [id])

  if (exercise === undefined) return <p className="muted">Loading…</p>
  if (exercise === null)
    return (
      <section className="card">
        <h2>Exercise not found</h2>
        <Link to="/exercises">Back to exercises</Link>
      </section>
    )

  return (
    <>
      <header className="page-header">
        <Link to="/exercises" className="back-link">
          ‹ Exercises
        </Link>
        <h1>{exercise.name}</h1>
      </header>
      {exercise.image && (
        <img className="exercise-image" src={IMAGE_BASE + exercise.image} alt=""
          loading="lazy"
          width={320}
          height={240}
          onError={(e) => (e.currentTarget.hidden = true)}
        />
      )}
      <dl className="card details">
        <dt>Primary</dt>
        <dd>{exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}</dd>
        {exercise.secondaryMuscles.length > 0 && (
          <>
            <dt>Secondary</dt>
            <dd>{exercise.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}</dd>
          </>
        )}
        <dt>Equipment</dt>
        <dd>{EQUIPMENT_LABELS[exercise.equipment]}</dd>
        <dt>Movement</dt>
        <dd>
          {PATTERN_LABELS[exercise.movementPattern]} · {exercise.mechanic}
        </dd>
        <dt>Default rest</dt>
        <dd>{Math.round(exercise.defaultRestSec / 60 * 10) / 10} min</dd>
      </dl>
      <section className="card">
        <h2>History</h2>
        <p className="muted">Your sets, PRs and estimated 1RM for this exercise will show here.</p>
      </section>
    </>
  )
}
