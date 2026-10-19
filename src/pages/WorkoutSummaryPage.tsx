import { Link, useLocation, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import Page from '../components/Page'
import { useSettings } from '../db/settings'
import { useWorkout } from '../db/workout'
import { PR_LABELS } from '../lib/prs'
import { formatWeight, toDisplay } from '../lib/units'
import { formatDuration, sessionVolumeKg } from '../lib/workout'

const BACK = { to: '/', label: 'Today' }

export default function WorkoutSummaryPage() {
  const { id } = useParams()
  const data = useWorkout(id)
  const { units } = useSettings()
  const justFinished = !!(useLocation().state as { justFinished?: boolean } | null)?.justFinished

  if (data === undefined) return <Page back={BACK} />
  if (data === null)
    return (
      <Page back={BACK}>
        <section className="empty">
          <Icon name="today" size={52} />
          <h2>Workout not found</h2>
          <Link to="/">Back to Today</Link>
        </section>
      </Page>
    )

  const { session, items, prs } = data
  const sets = items.flatMap((i) => i.sets)
  const date = new Date(session.startedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const prSets = items.flatMap((i) => i.sets.filter((s) => prs.has(s.id)).map((s) => ({ set: s, item: i })))

  return (
    <Page title={session.name} eyebrow={justFinished ? 'Workout complete' : date} back={BACK}>
      <dl className="stat-grid">
        <div>
          <dt>Duration</dt>
          <dd className="num">{formatDuration((session.endedAt ?? Date.now()) - session.startedAt)}</dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd className="num">
            {Math.round(toDisplay(sessionVolumeKg(sets), units)).toLocaleString()}
            <small>{units}</small>
          </dd>
        </div>
        <div>
          <dt>Sets</dt>
          <dd className="num">{sets.length}</dd>
        </div>
        <div className={prSets.length > 0 ? 'stat-pr' : undefined}>
          <dt>PRs</dt>
          <dd className="num">{prSets.length}</dd>
        </div>
      </dl>

      {prSets.length > 0 && (
        <section className="section">
          <h2 className="section-header">Personal records</h2>
          <ul className="group">
            {prSets.map(({ set, item }) => (
              <li key={set.id}>
                <div className="row">
                  <span className="row-icon icon-pr">
                    <Icon name="star" size={18} />
                  </span>
                  <span className="row-body">
                    <span className="row-title">{item.exercise?.name}</span>
                    <span className="row-subtitle">{prs.get(set.id)!.map((t) => PR_LABELS[t]).join(' · ')}</span>
                  </span>
                  <span className="row-value num">
                    {formatWeight(set.weightKg, units)} × {set.reps}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items
        .filter((i) => i.sets.length > 0)
        .map(({ sessionExercise, exercise, sets }) => (
          <section className="section" key={sessionExercise.id}>
            <h2 className="section-header">{exercise?.name ?? 'Unknown exercise'}</h2>
            <ul className="group">
              {sets.map((s) => (
                <li key={s.id}>
                  <div className="row">
                    <span className="set-number num">{s.setNumber}</span>
                    <span className="row-body num">
                      {s.weightKg > 0 ? `${formatWeight(s.weightKg, units)} × ${s.reps}` : `${s.reps} reps`}
                      {s.rpe !== undefined && <span className="secondary"> @{s.rpe}</span>}
                    </span>
                    {prs.has(s.id) && (
                      <span className="pr-badge">
                        <Icon name="star" size={12} />
                        PR
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

      {justFinished && (
        <Link to="/" className="btn btn-filled" replace>
          Done
        </Link>
      )}
    </Page>
  )
}
