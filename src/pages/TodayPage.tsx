import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Page from '../components/Page'
import { db } from '../db/db'

export default function TodayPage() {
  const activePlan = useLiveQuery(() => db.plans.filter((p) => p.isActive && !p.deletedAt).first())
  const exerciseCount = useLiveQuery(() => db.exercises.count())
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Page title="Today" eyebrow={date}>
      <section className="card">
        <h2 className="headline">{activePlan ? activePlan.name : 'No active plan'}</h2>
        <p className="subhead secondary">
          {activePlan ? 'Pick a day to start.' : 'Build a plan, or start an empty workout and add exercises as you go.'}
        </p>
        <button className="btn btn-filled" disabled>
          Start workout
        </button>
        <p className="footnote secondary center">Workout logging arrives in the next update.</p>
      </section>
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
