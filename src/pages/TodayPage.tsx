import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/db'

export default function TodayPage() {
  const activePlan = useLiveQuery(() => db.plans.filter((p) => p.isActive && !p.deletedAt).first())
  const exerciseCount = useLiveQuery(() => db.exercises.count())

  return (
    <>
      <header className="page-header">
        <h1>Today</h1>
      </header>
      <section className="card">
        <h2>{activePlan ? activePlan.name : 'No active plan'}</h2>
        <p className="muted">
          {activePlan ? 'Pick a day to start.' : 'Build a plan, or start an empty workout and add exercises as you go.'}
        </p>
        <button className="btn btn-primary btn-block" disabled>
          Start workout
        </button>
        <p className="muted small">Workout logging arrives in the next update.</p>
      </section>
      <section className="card">
        <h2>Exercise library</h2>
        <p className="muted">{exerciseCount ?? '…'} exercises available offline.</p>
        <Link to="/exercises" className="btn btn-block">
          Browse exercises
        </Link>
      </section>
    </>
  )
}
