import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import BodyCard from '../components/BodyCard'
import ColumnChart from '../components/charts/ColumnChart'
import Sparkline from '../components/charts/Sparkline'
import { recentPRSets, recentSessions, topLifts, weeklySets } from '../db/repo'
import { useSettings } from '../db/settings'
import { formatDay } from '../lib/format'
import { change } from '../lib/metrics'
import { PR_LABELS } from '../lib/prs'
import { formatSet } from '../lib/summary'
import { formatEstimate } from '../lib/units'

export default function ProgressPage() {
  const settings = useSettings()
  const sessions = useLiveQuery(() => recentSessions(50))
  const prs = useLiveQuery(() => recentPRSets(10))
  const lifts = useLiveQuery(() => topLifts(4))
  const weeks = useLiveQuery(() => weeklySets(12))
  const hasWorkouts = !!sessions && sessions.length > 0

  return (
    <>
      <header className="page-header">
        <h1>Progress</h1>
      </header>

      <BodyCard />

      {!hasWorkouts && sessions && (
        <section className="card empty">
          <h2>No workouts yet</h2>
          <p className="muted">Finish a workout and your lift trends, PRs and history will show up here.</p>
        </section>
      )}

      {lifts && lifts.length > 0 && (
        <section className="card" aria-labelledby="lifts-heading">
          <h2 id="lifts-heading">Your main lifts</h2>
          <p className="muted small">Best estimated 1RM per workout, last 90 days.</p>
          <ul className="lift-list">
            {lifts.map(({ exercise, trend }) => {
              const pct = change(trend)
              return (
                <li key={exercise.id}>
                  <Link to={`/exercises/${encodeURIComponent(exercise.id)}`} className="lift-row">
                    <span className="grow">
                      <span className="list-title">{exercise.name}</span>
                      <span className="list-meta">
                        {trend.length > 0 ? formatEstimate(trend[trend.length - 1].y, settings.units) : '–'}
                        {pct !== null && ` · ${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`}
                      </span>
                    </span>
                    <Sparkline points={trend} />
                    <ChevronRight size={18} className="muted" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {hasWorkouts && weeks && (
        <section className="card" aria-labelledby="weeks-heading">
          <h2 id="weeks-heading">Working sets per week</h2>
          <ColumnChart
            title="Working sets per week, last 12 weeks"
            points={weeks}
            formatX={(x) => new Date(x).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            formatY={(y) => String(y)}
          />
        </section>
      )}

      {prs && prs.length > 0 && (
        <section className="card pr-card">
          <h2>
            <Trophy size={14} aria-hidden className="pr-mark" /> Recent PRs
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

      {hasWorkouts && (
        <>
          <h2 className="section-title">Workout history</h2>
          <ul className="list">
            {sessions.map((s) => (
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
      )}
    </>
  )
}
