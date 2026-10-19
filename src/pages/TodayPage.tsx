import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronRight, Play, Plus, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Sheet from '../components/Sheet'
import { db } from '../db/db'
import {
  alive,
  finishedSessionStarts,
  getActiveSession,
  lastPerformance,
  loadPlan,
  loadSession,
  recentPRSets,
  recentSessions,
  startSession,
  volumeSinceKg,
} from '../db/repo'
import { useSettings } from '../db/settings'
import { unlockAudio } from '../lib/feedback'
import { formatClock, formatDay, formatDuration, formatRest, formatTarget } from '../lib/format'
import { PR_LABELS } from '../lib/prs'
import { bestSet, formatSet } from '../lib/summary'
import type { SetLog } from '../lib/types'
import { toDisplay } from '../lib/units'
import { startOfWeek, weekStreak, weekSummary } from '../lib/week'
import { useNow } from '../state/restTimer'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** Only celebrate a PR on Today while it's fresh. */
const PR_FRESH_MS = 14 * 86400000
/** How many of the next day's exercises the hero lists; the rest are a tap away. */
const HERO_EXERCISES = 3

/** Launchpad: what to do next, how the week is going, and what you did recently. */
export default function TodayPage() {
  const navigate = useNavigate()
  const settings = useSettings()
  const active = useLiveQuery(async () => {
    const session = await getActiveSession()
    if (!session) return null
    const sets = (await loadSession(session.id))?.exercises.flatMap((e) => e.sets) ?? []
    return { session, done: sets.filter((s) => s.completedAt).length, total: sets.length }
  })
  const plan = useLiveQuery(async () => {
    const p = (await db.plans.toArray()).find((x) => alive(x) && x.isActive)
    return p ? await loadPlan(p.id) : null
  })
  const recent = useLiveQuery(() => recentSessions(5))
  const now = useNow(active ? 1000 : 60_000)
  const weekStart = startOfWeek(now)
  const week = useLiveQuery(async () => {
    const starts = await finishedSessionStarts()
    return { starts, volumeKg: await volumeSinceKg(weekStart) }
  }, [weekStart])
  const latestPR = useLiveQuery(async () => (await recentPRSets(1))[0] ?? null)
  const [previewDayId, setPreviewDayId] = useState<string | null>(null)
  const preview = plan?.days.find((d) => d.day.id === previewDayId)

  // Suggest the day after the one you did last.
  const lastDayId = recent?.find((s) => s.planDayId && plan?.days.some((d) => d.day.id === s.planDayId))?.planDayId
  const lastIndex = plan?.days.findIndex((d) => d.day.id === lastDayId) ?? -1
  const next = plan && plan.days.length > 0 ? plan.days[(lastIndex + 1) % plan.days.length] : null
  const otherDays = plan?.days.filter((d) => d !== next) ?? []

  // Last time's best set for each exercise in the next day, so you know what you're aiming for.
  const nextExerciseIds = next?.exercises.map((e) => e.exercise.id).join() ?? ''
  const bests = useLiveQuery(async () => {
    const out = new Map<string, SetLog>()
    for (const { exercise } of next?.exercises.slice(0, HERO_EXERCISES) ?? []) {
      const best = bestSet(await lastPerformance(exercise.id))
      if (best) out.set(exercise.id, best)
    }
    return out
  }, [nextExerciseIds])

  const start = async (planDayId?: string) => {
    unlockAudio() // so the rest timer can beep later
    await startSession(planDayId)
    navigate('/workout')
  }

  const date = new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const showWeek = !active && week && (week.starts.length > 0 || !!plan)
  const freshPR = latestPR && now - latestPR.set.completedAt! < PR_FRESH_MS ? latestPR : null
  // Render the page in one go once everything has loaded: cards appearing one by one push the
  // Start buttons around, and a tap aimed at one lands on another.
  const loaded = [active, plan, recent, week, latestPR].every((x) => x !== undefined)

  return (
    <>
      <header className="page-header">
        <span className="header-date">{date}</span>
        <h1>Today</h1>
      </header>
      {loaded && (
        <>
          {active && (
            <section className="card hero hero-live" aria-label="Workout in progress">
              <span className="eyebrow">Workout in progress</span>
              <h2 className="hero-title">{active.session.name}</h2>
              <span className="hero-timer" aria-label="Elapsed time">
                {formatClock((now - active.session.startedAt) / 1000)}
              </span>
              {active.total > 0 && (
                <span className="hero-progress">
                  <span className="hero-progress-bar" style={{ width: `${(active.done / active.total) * 100}%` }} />
                  <span className="muted small">
                    {active.done} of {active.total} sets done
                  </span>
                </span>
              )}
              <Link to="/workout" className="btn btn-primary btn-block btn-hero">
                Resume workout
              </Link>
            </section>
          )}

          {!active && next && (
            <section className="card hero" aria-label="Up next">
              <span className="eyebrow">Up next in {plan!.plan.name}</span>
              <h2 className="hero-title">{next.day.name}</h2>
              {next.exercises.length > 0 ? (
                <ol className="hero-list">
                  {next.exercises.slice(0, HERO_EXERCISES).map(({ pe, exercise }) => {
                    const best = bests?.get(exercise.id)
                    return (
                      <li key={pe.id}>
                        <span className="hero-exercise">
                          <span className="hero-exercise-name">{exercise.name}</span>
                          <span className="list-meta">
                            {formatTarget(pe.targetSets, pe.repMin, pe.repMax, exercise.logging)}
                            {best && `, last time ${formatSet(best, settings, exercise.logging)}`}
                          </span>
                        </span>
                      </li>
                    )
                  })}
                  {next.exercises.length > HERO_EXERCISES && (
                    <li>
                      <button className="hero-more" onClick={() => setPreviewDayId(next.day.id)}>
                        All {next.exercises.length} exercises
                      </button>
                    </li>
                  )}
                </ol>
              ) : (
                <p className="muted">
                  <Link to={`/plans/${plan!.plan.id}`}>Add exercises</Link> to this day to start it.
                </p>
              )}
              <button className="btn btn-primary btn-block btn-hero" onClick={() => start(next.day.id)} disabled={next.exercises.length === 0}>
                <Play size={20} aria-hidden fill="currentColor" /> Start {next.day.name}
              </button>
            </section>
          )}

          {!active && plan && plan.days.length === 0 && (
            <section className="card">
              <span className="eyebrow">{plan.plan.name}</span>
              <p className="muted">
                This plan has no days yet. <Link to={`/plans/${plan.plan.id}`}>Add some</Link>
              </p>
            </section>
          )}

          {!active && plan === null && (
            <section className="card hero">
              <h2 className="hero-title">No plan yet</h2>
              <p className="muted">Pick a template or build your own. Or start an empty workout and add exercises as you go.</p>
              <Link to="/plans" className="btn btn-primary btn-block btn-hero">
                Create a plan
              </Link>
            </section>
          )}

          {showWeek && (
            <WeekCard
              starts={week.starts}
              now={now}
              goal={plan?.days.length ?? 0}
              volume={toDisplay(week.volumeKg, settings.units)}
              units={settings.units}
            />
          )}

          {freshPR && (
            <Link to={`/exercises/${encodeURIComponent(freshPR.exercise.id)}`} className="card pr-row">
              <Trophy size={14} aria-hidden className="pr-mark" />
              <span className="grow">
                <span className="eyebrow">Latest PR · {formatDay(freshPR.set.completedAt!, now)}</span>
                <span className="list-title">{freshPR.exercise.name}</span>
                <span className="list-meta">{PR_LABELS[freshPR.set.prs![0]]}</span>
              </span>
              <span className="pr-value">{formatSet(freshPR.set, settings, freshPR.exercise.logging)}</span>
            </Link>
          )}

          {!active && otherDays.length > 0 && (
            <>
              <h2 className="section-label">Other days</h2>
              <ul className="day-list">
                {otherDays.map(({ day, exercises }) => (
                  <li key={day.id} className="day-row">
                    <button className="day-button" onClick={() => setPreviewDayId(day.id)} aria-label={`${day.name}: view exercises`}>
                      <span className="list-title">{day.name}</span>
                      <span className="list-meta">
                        {exercises.length === 0 ? 'No exercises yet' : `${exercises.length} exercises`}
                      </span>
                    </button>
                    <button className="day-start" onClick={() => start(day.id)} disabled={exercises.length === 0} aria-label={`Start ${day.name}`}>
                      <Play size={20} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
        </>
      )}

      {!active && (
        <button className="btn btn-block" onClick={() => start()}>
          <Plus size={20} aria-hidden /> Start empty workout
        </button>
      )}

      {preview && (
        <Sheet title={preview.day.name} onClose={() => setPreviewDayId(null)}>
          {preview.exercises.length === 0 ? (
            <p className="muted">No exercises on this day yet.</p>
          ) : (
            <ol className="preview-list">
              {preview.exercises.map(({ pe, exercise }) => (
                <li key={pe.id}>
                  <span className="list-title">{exercise.name}</span>
                  <span className="list-meta">
                    {formatTarget(pe.targetSets, pe.repMin, pe.repMax, exercise.logging)} · rest {formatRest(pe.restSec)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {preview.exercises.length > 0 && (
            <button className="btn btn-primary btn-block" onClick={() => start(preview.day.id)}>
              <Play size={18} aria-hidden /> Start {preview.day.name}
            </button>
          )}
          <Link to={`/plans/${plan!.plan.id}`} className="btn btn-block">
            Edit plan
          </Link>
        </Sheet>
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
                    <span className="list-meta">
                      {formatDay(s.startedAt, now)} · {formatDuration(s.endedAt! - s.startedAt)}
                    </span>
                  </span>
                  <ChevronRight size={20} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
        </>
      )}
    </>
  )
}

function WeekCard({ starts, now, goal, volume, units }: { starts: number[]; now: number; goal: number; volume: number; units: string }) {
  const { trained, todayIndex, count } = weekSummary(starts, now)
  const streak = weekStreak(starts, now)
  return (
    <section className="card week" aria-labelledby="week-title">
      <h2 id="week-title">This week</h2>
      <ol className="week-strip">
        {WEEKDAYS.map((name, i) => (
          <li
            key={name}
            className={`week-day${trained[i] ? ' trained' : ''}${i === todayIndex ? ' today' : ''}`}
            aria-label={`${name}${i === todayIndex ? ' (today)' : ''}: ${trained[i] ? 'trained' : i > todayIndex ? 'to come' : 'rest'}`}
          >
            <span className="week-letter" aria-hidden="true">
              {name[0]}
            </span>
            <span className="week-dot" aria-hidden="true">
              {trained[i] && <Check size={16} strokeWidth={3} />}
            </span>
          </li>
        ))}
      </ol>
      <dl className="week-stats">
        <div>
          <dt>Workouts</dt>
          <dd>
            {count}
            {goal > 0 && <small> / {goal}</small>}
          </dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd>
            {Math.round(volume).toLocaleString()}
            <small> {units}</small>
          </dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>
            {streak}
            <small> {streak === 1 ? 'week' : 'weeks'}</small>
          </dd>
        </div>
      </dl>
    </section>
  )
}
