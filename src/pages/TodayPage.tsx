import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Play, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { alive, getActiveSession, loadPlan, recentSessions, startSession } from '../db/repo'
import { unlockAudio } from '../lib/feedback'
import { formatClock, formatDay } from '../lib/format'
import { useNow } from '../state/restTimer'

export default function TodayPage() {
  const navigate = useNavigate()
  const active = useLiveQuery(async () => (await getActiveSession()) ?? null)
  const plan = useLiveQuery(async () => {
    const p = (await db.plans.toArray()).find((x) => alive(x) && x.isActive)
    return p ? await loadPlan(p.id) : null
  })
  const recent = useLiveQuery(() => recentSessions(5))
  const now = useNow(active ? 1000 : null)

  // Suggest the day after the one you did last.
  const lastDayId = recent?.find((s) => s.planDayId && plan?.days.some((d) => d.day.id === s.planDayId))?.planDayId
  const lastIndex = plan?.days.findIndex((d) => d.day.id === lastDayId) ?? -1
  const nextDayId = plan && plan.days.length > 0 ? plan.days[(lastIndex + 1) % plan.days.length].day.id : null

  const start = async (planDayId?: string) => {
    unlockAudio() // so the rest timer can beep later
    await startSession(planDayId)
    navigate('/workout')
  }

  return (
    <>
      <header className="page-header">
        <h1>Today</h1>
      </header>

      {active && (
        <Link to="/workout" className="card resume-card">
          <span>
            <span className="eyebrow">Workout in progress</span>
            <span className="list-title">{active.name}</span>
            <span className="muted small">{formatClock((now - active.startedAt) / 1000)}</span>
          </span>
          <span className="btn btn-primary">Resume</span>
        </Link>
      )}

      {!active && plan && (
        <section className="card">
          <span className="eyebrow">{plan.plan.name}</span>
          {plan.days.length === 0 ? (
            <p className="muted">
              This plan has no days yet. <Link to={`/plans/${plan.plan.id}`}>Add some</Link>
            </p>
          ) : (
            <ul className="day-list">
              {plan.days.map(({ day, exercises }) => (
                <li key={day.id}>
                  <button
                    className={`day-button ${day.id === nextDayId ? 'next' : ''}`}
                    onClick={() => start(day.id)}
                    disabled={exercises.length === 0}
                    aria-label={`Start ${day.name}`}
                  >
                    <span>
                      <span className="list-title">
                        {day.name} {day.id === nextDayId && <span className="badge">Up next</span>}
                      </span>
                      <span className="list-meta">
                        {exercises.length === 0
                          ? 'No exercises yet'
                          : exercises
                              .slice(0, 3)
                              .map((e) => e.exercise.name)
                              .join(', ') + (exercises.length > 3 ? ` +${exercises.length - 3}` : '')}
                      </span>
                    </span>
                    <Play size={20} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!active && plan === null && (
        <section className="card">
          <h2>Get started</h2>
          <p className="muted">Build a plan or pick a template, or just start a workout and add exercises as you go.</p>
          <Link to="/plans" className="btn btn-primary btn-block">
            Create a plan
          </Link>
        </section>
      )}

      {!active && (
        <button className="btn btn-block" onClick={() => start()}>
          <Plus size={20} aria-hidden /> Start empty workout
        </button>
      )}

      {recent && recent.length > 0 && (
        <>
          <h2 className="section-title">Recent workouts</h2>
          <ul className="list">
            {recent.map((s) => (
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
