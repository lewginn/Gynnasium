import { useLiveQuery } from 'dexie-react-hooks'
import { Check, ChevronLeft, ChevronRight, Flag, Play } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Sheet from '../components/Sheet'
import { activeGoal, daysOff, getActiveSession, goalPhases, plansWithDays, setDayOff, startSession, workoutsByDate } from '../db/repo'
import { unlockAudio } from '../lib/feedback'
import { countdown, countdownText } from '../lib/goals'
import { WEEKDAY_SHORT, dayPlan, longDate, monthGrid, shortDate, todayKey, type DayPlan } from '../lib/schedule'
import { dayLabel } from '../lib/weeks'

/** Month view: what's scheduled each day up to your goal, days off, and what you did. */
export default function CalendarPage() {
  const navigate = useNavigate()
  const today = todayKey()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const data = useLiveQuery(async () => {
    const goal = await activeGoal()
    return {
      plans: await plansWithDays(),
      off: await daysOff(),
      done: await workoutsByDate(),
      goal,
      phases: goal ? await goalPhases(goal.id) : [],
    }
  })

  const shift = (by: number) => setMonth(({ year, month }) => ({ year: year + Math.floor((month + by) / 12), month: (((month + by) % 12) + 12) % 12 }))
  const title = new Date(month.year, month.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  if (!data) return <p className="muted">Loading…</p>
  const { plans, off, done, goal, phases } = data
  const planFor = (date: string) => dayPlan(date, plans, off)
  const anySchedule = plans.some(({ days }) => days.some((d) => (d.weekdays?.length ?? 0) > 0))

  return (
    <>
      <header className="page-header">
        <Link to="/" className="back-link">
          <ChevronLeft size={18} aria-hidden /> Today
        </Link>
        <h1>Calendar</h1>
      </header>

      {goal && (
        <Link to="/goal" className="card goal-strip">
          <Flag size={18} aria-hidden className="goal-flag" />
          <span className="grow">
            <span className="list-title">{goal.name}</span>
            <span className="list-meta">
              {longDate(goal.targetDate)} · {countdownText(countdown(goal, today))}
            </span>
          </span>
          <ChevronRight size={18} aria-hidden className="muted" />
        </Link>
      )}

      <section className="card calendar" aria-label={title}>
        <div className="calendar-head">
          <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft size={22} />
          </button>
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="calendar-grid" role="grid">
          <div role="row" className="calendar-row calendar-weekdays">
            {WEEKDAY_SHORT.map((d) => (
              <span key={d} role="columnheader" aria-label={d}>
                {d[0]}
              </span>
            ))}
          </div>
          {monthGrid(month.year, month.month).map((week) => (
            <div role="row" className="calendar-row" key={week[0].date}>
              {week.map(({ date, inMonth }) => {
                const p = planFor(date)
                const trained = done.has(date)
                const isGoal = goal?.targetDate === date
                return (
                  <button
                    key={date}
                    role="gridcell"
                    className={`calendar-day${inMonth ? '' : ' outside'}${date === today ? ' today' : ''}${p.kind === 'off' ? ' off' : ''}`}
                    aria-label={cellLabel(date, p, trained, isGoal ? goal!.name : null)}
                    onClick={() => setSelected(date)}
                  >
                    <span className="calendar-num">{Number(date.slice(8))}</span>
                    <span className="calendar-tag">
                      {trained ? (
                        <Check size={14} strokeWidth={3} aria-hidden />
                      ) : p.kind === 'off' ? (
                        'Off'
                      ) : p.kind === 'workout' ? (
                        p.day.name
                      ) : null}
                    </span>
                    {isGoal && <Flag size={12} aria-hidden className="calendar-goal" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        {!anySchedule && (
          <p className="muted small">
            No workouts on fixed days yet. In a plan, use <strong>Weekly schedule</strong> to put each day on a weekday.
          </p>
        )}
      </section>

      {phases.length > 0 && (
        <>
          <h2 className="section-label">Phases</h2>
          <ul className="list">
            {phases.map((ph) => (
              <li key={ph.id}>
                <Link to={`/plans/${ph.id}`} className="list-row list-row-split">
                  <span>
                    <span className="list-title">
                      {ph.name} {ph.startsOn! <= today && today <= ph.endsOn! && <span className="badge">Now</span>}
                    </span>
                    <span className="list-meta">
                      {shortDate(ph.startsOn!)} – {shortDate(ph.endsOn!)}
                    </span>
                  </span>
                  <ChevronRight size={20} aria-hidden className="muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {!goal && (
        <Link to="/goal" className="btn btn-block">
          <Flag size={18} aria-hidden /> Set a goal
        </Link>
      )}

      {selected && (
        <DaySheet
          date={selected}
          today={today}
          plan={planFor(selected)}
          workouts={done.get(selected) ?? []}
          note={off.get(selected)}
          goalName={goal?.targetDate === selected ? goal.name : null}
          onClose={() => setSelected(null)}
          onStart={async (planDayId) => {
            unlockAudio()
            if (!(await getActiveSession())) await startSession(planDayId)
            navigate('/workout')
          }}
        />
      )}
    </>
  )
}

function cellLabel(date: string, p: DayPlan, trained: boolean, goal: string | null): string {
  const parts = [shortDate(date)]
  if (p.kind === 'workout') parts.push(dayLabel(p.day))
  if (p.kind === 'off') parts.push('day off')
  if (trained) parts.push('trained')
  if (goal) parts.push(`goal: ${goal}`)
  return parts.join(', ')
}

function DaySheet({
  date,
  today,
  plan,
  workouts,
  note,
  goalName,
  onClose,
  onStart,
}: {
  date: string
  today: string
  plan: DayPlan
  workouts: { id: string; name: string }[]
  note: string | undefined
  goalName: string | null
  onClose: () => void
  onStart: (planDayId: string) => void
}) {
  const isOff = plan.kind === 'off'
  const [noteText, setNoteText] = useState(note ?? '')
  const scheduled = plan.kind === 'workout' ? plan : plan.kind === 'off' ? plan.skipped : undefined
  return (
    <Sheet title={longDate(date)} onClose={onClose}>
      <div className="stack-sm">
        {goalName && (
          <p className="account-line">
            <Flag size={18} aria-hidden className="goal-flag" /> {goalName}
          </p>
        )}
        {scheduled ? (
          <p>
            <strong>{dayLabel(scheduled.day)}</strong>
            <span className="muted"> · {scheduled.plan.name}</span>
            {isOff && <span className="muted"> (skipped: day off)</span>}
          </p>
        ) : plan.kind === 'rest' ? (
          <p className="muted">Rest day in {plan.plan.name}.</p>
        ) : plan.kind === 'rotation' ? (
          <p className="muted">{plan.plan.name} has no fixed days: Today suggests the next day in order.</p>
        ) : null}
        {plan.kind === 'workout' && date === today && (
          <button className="btn btn-primary btn-block" onClick={() => onStart(plan.day.id)}>
            <Play size={18} aria-hidden fill="currentColor" /> Start {plan.day.name}
          </button>
        )}
        {workouts.length > 0 && (
          <ul className="plain-list">
            {workouts.map((w) => (
              <li key={w.id}>
                <Link to={`/history/${w.id}`}>
                  <Check size={14} aria-hidden /> {w.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <label className="toggle">
          <span>
            Day off
            <span className="muted small block">Scheduled workouts skip it, and the coach plans around it.</span>
          </span>
          <input type="checkbox" checked={isOff} onChange={(e) => setDayOff(date, e.target.checked, noteText)} />
        </label>
        {isOff && (
          <label className="field">
            <span>Note</span>
            <input
              className="input"
              value={noteText}
              placeholder="e.g. Travelling"
              maxLength={60}
              onChange={(e) => setNoteText(e.target.value)}
              onBlur={() => setDayOff(date, true, noteText)}
            />
          </label>
        )}
      </div>
    </Sheet>
  )
}
