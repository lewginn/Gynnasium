import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { recentPRSets, recentSessions } from '../db/repo'
import { useSettings } from '../db/settings'
import { formatDay } from '../lib/format'
import { PR_LABELS } from '../lib/prs'
import { formatSet } from '../lib/summary'

export default function ProgressPage() {
  const settings = useSettings()
  const sessions = useLiveQuery(() => recentSessions(50))
  const prs = useLiveQuery(() => recentPRSets(10))

  if (sessions && sessions.length === 0)
    return (
      <>
        <header className="page-header">
          <h1>Progress</h1>
        </header>
        <section className="card empty">
          <h2>Nothing to show yet</h2>
          <p className="muted">Finish a workout and your history and PRs will show up here. Charts come next.</p>
        </section>
      </>
    )

  return (
    <>
      <header className="page-header">
        <h1>Progress</h1>
      </header>

      {prs && prs.length > 0 && (
        <section className="card pr-card">
          <h2>
            <Trophy size={20} aria-hidden /> Recent PRs
          </h2>
          <ul className="plain-list">
            {prs.map(({ set, exercise }) => (
              <li key={set.id}>
                <Link to={`/exercises/${encodeURIComponent(exercise.id)}`}>
                  <strong>{exercise.name}</strong>
                </Link>
                : {formatSet(set, settings, exercise.logging)}
                <span className="muted small block">
                  {set.prs!.map((p) => PR_LABELS[p]).join(' · ')} · {formatDay(set.completedAt!)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="section-title">Workout history</h2>
      <ul className="list">
        {sessions?.map((s) => (
          <li key={s.id}>
            <Link to={`/history/${s.id}`} className="list-row list-row-split">
              <span>
                <span className="list-title">{s.name}</span>
                <span className="list-meta">{formatDay(s.startedAt)}</span>
              </span>
              <ChevronRight size={20} aria-hidden className="muted" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
