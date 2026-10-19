import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import Page from '../components/Page'
import { db } from '../db/db'
import { startWorkout, useActiveSession, useRecentWorkouts } from '../db/workout'
import { useNow } from '../hooks/useNow'
import { formatDuration } from '../lib/workout'

export default function TodayPage() {
  const activePlan = useLiveQuery(() => db.plans.filter((p) => p.isActive && !p.deletedAt).first())
  const exerciseCount = useLiveQuery(() => db.exercises.count())
  const active = useActiveSession()
  const recent = useRecentWorkouts()
  const now = useNow(1000, !!active)
  const navigate = useNavigate()
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  const start = async () => {
    await startWorkout()
    navigate('/workout')
  }

  return (
    <Page title="Today" eyebrow={date}>
      {active ? (
        <section className="card card-live">
          <p className="card-kicker">In progress</p>
          <h2 className="headline">{active.name}</h2>
          <p className="hero-number num">{formatDuration(now - active.startedAt)}</p>
          <Link to="/workout" className="btn btn-filled">
            Resume workout
          </Link>
        </section>
      ) : (
        <section className="card">
          <h2 className="headline">{activePlan ? activePlan.name : 'No active plan'}</h2>
          <p className="subhead secondary">
            {activePlan ? 'Pick a day to start.' : 'Start an empty workout and add exercises as you go.'}
          </p>
          <button className="btn btn-filled" onClick={start}>
            Start workout
          </button>
        </section>
      )}

      {recent && recent.length > 0 && (
        <section className="section">
          <h2 className="section-header">Recent workouts</h2>
          <ul className="group">
            {recent.map(({ session, setCount }) => (
              <li key={session.id}>
                <Link to={`/workouts/${session.id}`} className="row">
                  <span className="row-body">
                    <span className="row-title">{session.name}</span>
                    <span className="row-subtitle">
                      {new Date(session.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                      {' · '}
                      {formatDuration(session.endedAt! - session.startedAt)}
                      {' · '}
                      {setCount} {setCount === 1 ? 'set' : 'sets'}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={16} className="row-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section-header">Library</h2>
        <ul className="group">
          <li>
            <Link to="/exercises" className="row">
              <span className="row-icon icon-blue">
                <Icon name="dumbbell" size={20} />
              </span>
              <span className="row-body">
                <span className="row-title">Browse exercises</span>
                <span className="row-subtitle">{exerciseCount ?? '…'} exercises available offline</span>
              </span>
              <Icon name="chevronRight" size={16} className="row-chevron" />
            </Link>
          </li>
        </ul>
      </section>
    </Page>
  )
}
