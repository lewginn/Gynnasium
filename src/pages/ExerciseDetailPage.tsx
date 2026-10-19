import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import Page from '../components/Page'
import { db } from '../db/db'
import { EQUIPMENT_LABELS, MUSCLE_LABELS, PATTERN_LABELS } from '../lib/labels'

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
const BACK = { to: '/exercises', label: 'Exercises' }

export default function ExerciseDetailPage() {
  const { id = '' } = useParams()
  const exercise = useLiveQuery(async () => (await db.exercises.get(id)) ?? null, [id])

  if (exercise === undefined) return <Page back={BACK} />
  if (exercise === null)
    return (
      <Page back={BACK}>
        <section className="empty">
          <Icon name="dumbbell" size={52} />
          <h2>Exercise not found</h2>
          <Link to="/exercises">Back to exercises</Link>
        </section>
      </Page>
    )

  const details = [
    ['Primary', exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')],
    ...(exercise.secondaryMuscles.length > 0
      ? [['Secondary', exercise.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')]]
      : []),
    ['Equipment', EQUIPMENT_LABELS[exercise.equipment]],
    ['Movement', `${PATTERN_LABELS[exercise.movementPattern]} · ${exercise.mechanic}`],
    ['Default rest', `${Math.round((exercise.defaultRestSec / 60) * 10) / 10} min`],
  ]

  return (
    <Page title={exercise.name} back={BACK}>
      {exercise.image && (
        <img
          className="media"
          src={IMAGE_BASE + exercise.image}
          alt=""
          loading="lazy"
          width={320}
          height={240}
          onError={(e) => (e.currentTarget.hidden = true)}
        />
      )}
      <section className="section">
        <h2 className="section-header">Details</h2>
        <ul className="group">
          {details.map(([label, value]) => (
            <li key={label}>
              <div className="row">
                <span>{label}</span>
                <span className="row-value">{value}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <h2 className="section-header">History</h2>
        <div className="card">
          <p className="subhead secondary">Your sets, PRs and estimated 1RM for this exercise will show here.</p>
        </div>
      </section>
    </Page>
  )
}
