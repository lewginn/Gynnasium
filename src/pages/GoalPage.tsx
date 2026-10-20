import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Flag, MessagesSquare, Pencil, Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { activeGoal, alive, deleteGoal, goalData, goalPhases, loadExercises, saveGoal, type GoalFields } from '../db/repo'
import { useSettings } from '../db/settings'
import { METRIC_LABELS, countdown, countdownText, formatAmount, formatPace, targetLabel, targetProgress } from '../lib/goals'
import { POPULAR_EXERCISE_IDS } from '../lib/popular'
import { addDays, longDate, shortDate, todayKey } from '../lib/schedule'
import type { BodyMetricType, Exercise, Goal, GoalTarget, Settings } from '../lib/types'
import { roundForDisplay, toKg } from '../lib/units'
import { useConfirm } from '../state/confirm'

/** Your goal: a date to train towards, with targets, a countdown, the phases planned to it and food targets. */
export default function GoalPage() {
  const goal = useLiveQuery(async () => (await activeGoal()) ?? null)
  const [editing, setEditing] = useState(false)
  if (goal === undefined) return <p className="muted">Loading…</p>
  if (!goal || editing) return <GoalForm goal={goal} onDone={() => setEditing(false)} />
  return <GoalView goal={goal} onEdit={() => setEditing(true)} />
}

function GoalView({ goal, onEdit }: { goal: Goal; onEdit: () => void }) {
  const settings = useSettings()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const today = todayKey()
  const info = useLiveQuery(async () => {
    const data = await goalData(goal)
    return { progress: goal.targets.map((t) => targetProgress(t, goal, data, today)), phases: await goalPhases(goal.id) }
  }, [goal, today])

  return (
    <>
      <header className="page-header">
        <Link to="/" className="back-link">
          <ChevronLeft size={18} aria-hidden /> Today
        </Link>
        <div className="title-row">
          <h1>{goal.name}</h1>
          <button className="icon-btn" aria-label="Edit goal" onClick={onEdit}>
            <Pencil size={18} />
          </button>
        </div>
        <p className="muted">
          {longDate(goal.targetDate)} · {countdownText(countdown(goal, today))}
        </p>
      </header>

      {goal.description && <p className="card">{goal.description}</p>}

      {info && info.progress.length > 0 && (
        <section className="card" aria-labelledby="targets-heading">
          <h2 id="targets-heading">Targets</h2>
          <ul className="goal-targets">
            {info.progress.map((p) => {
              const pace = formatPace(p, settings.units)
              return (
                <li key={p.label}>
                  <span className="row">
                    <span className="grow list-title">{p.label}</span>
                    {p.done && (
                      <span className="goal-done">
                        <Check size={14} strokeWidth={3} aria-hidden /> Reached
                      </span>
                    )}
                  </span>
                  <span className="list-meta">
                    {p.current === null ? 'Nothing logged yet' : `Now ${formatAmount(p.current, p.unit, settings.units)}`} · target{' '}
                    {formatAmount(p.target, p.unit, settings.units)}
                  </span>
                  {p.fraction !== null && (
                    <span className="goal-bar" role="progressbar" aria-label={`${p.label} progress`} aria-valuenow={Math.round(p.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <span style={{ width: `${p.fraction * 100}%` }} />
                    </span>
                  )}
                  {pace && <span className="list-meta">{pace} to get there</span>}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {goal.calories && (
        <section className="card" aria-labelledby="food-heading">
          <h2 id="food-heading">Food</h2>
          <p>
            <strong>{goal.calories.toLocaleString()} kcal</strong> and <strong>{goal.proteinG} g protein</strong> a day
          </p>
          {goal.nutritionNote && <p className="muted small">{goal.nutritionNote}</p>}
        </section>
      )}

      <h2 className="section-label">Plan to the date</h2>
      {info && info.phases.length > 0 ? (
        <ul className="list">
          {info.phases.map((ph) => (
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
      ) : (
        <p className="muted small friends-empty">No plan to the date yet. Claude can split the time into phases, on the days you can train.</p>
      )}

      <Link to="/goal/coach" className="btn btn-primary btn-block">
        <MessagesSquare size={20} aria-hidden /> {info?.phases.length ? 'Re-plan with Claude' : 'Plan with Claude'}
      </Link>
      <Link to="/calendar" className="btn btn-block">
        <CalendarDays size={20} aria-hidden /> Calendar
      </Link>
      <button
        className="btn btn-danger-text btn-block"
        onClick={async () => {
          if (await confirm({ title: `Delete ${goal.name}?`, message: 'Its phase plans are kept as ordinary plans.', action: 'Delete goal', destructive: true })) {
            await deleteGoal(goal.id)
            navigate('/')
          }
        }}
      >
        Delete goal
      </button>
    </>
  )
}

type Kind = 'bodyweight' | Exclude<BodyMetricType, 'bodyweight'> | 'lift'
const KINDS: Kind[] = ['bodyweight', 'bodyfat', 'waist', 'chest', 'arm', 'thigh', 'lift']

const unitOf = (kind: Kind, settings: Settings) => (kind === 'bodyweight' || kind === 'lift' ? settings.units : kind === 'bodyfat' ? '%' : 'cm')

function GoalForm({ goal, onDone }: { goal: Goal | null; onDone: () => void }) {
  const settings = useSettings()
  const tomorrow = addDays(todayKey(), 1)
  const [name, setName] = useState(goal?.name ?? '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? addDays(todayKey(), 84))
  const [description, setDescription] = useState(goal?.description ?? '')
  const [targets, setTargets] = useState<GoalTarget[]>(goal?.targets ?? [])
  const [calories, setCalories] = useState(goal?.calories ? String(goal.calories) : '')
  const [protein, setProtein] = useState(goal?.proteinG ? String(goal.proteinG) : '')
  // Lifts you've done (weight × reps), else the common staples, for lift targets.
  const lifts = useLiveQuery(async () => {
    const done = new Set((await db.setLogs.toArray()).filter((s) => alive(s) && s.completedAt).map((s) => s.exerciseId))
    const ids = done.size ? [...done] : POPULAR_EXERCISE_IDS
    // Staples first, in their usual order (bench, squat…), then the rest by name.
    const rank = (id: string) => (POPULAR_EXERCISE_IDS.indexOf(id) + 1 || Infinity)
    return [...(await loadExercises(ids)).values()]
      .filter((e) => e.logging === 'weight_reps')
      .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))
  })
  const names = new Map((lifts ?? []).map((e) => [e.id, e.name]))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const num = (v: string) => (v.trim() ? Math.round(Number(v)) || undefined : undefined)
    const fields: GoalFields = {
      name: name.trim(),
      targetDate,
      description: description.trim() || undefined,
      targets,
      calories: num(calories),
      proteinG: num(protein),
      nutritionNote: goal?.nutritionNote,
    }
    await saveGoal(fields, goal?.id)
    onDone()
  }

  return (
    <>
      <header className="page-header">
        <Link to="/" className="back-link">
          <ChevronLeft size={18} aria-hidden /> Today
        </Link>
        <h1>{goal ? 'Edit goal' : 'Set a goal'}</h1>
        <p className="muted">Something to train towards by a date, like a holiday. Add targets to track, or just describe it.</p>
      </header>
      <form className="stack" aria-label="Goal" onSubmit={submit}>
        <section className="card stack-sm">
          <label className="field">
            <span>Name</span>
            <input className="input" required maxLength={40} placeholder="e.g. Ibiza" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Date</span>
            <input className="input" type="date" required min={tomorrow} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              className="input goal-description"
              rows={2}
              maxLength={300}
              placeholder="e.g. Look lean on the beach, keep my strength"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </section>

        <section className="card stack-sm" aria-labelledby="goal-targets-heading">
          <h2 id="goal-targets-heading">Targets</h2>
          {targets.length > 0 && (
            <ul className="plain-list">
              {targets.map((t, i) => (
                <li key={i} className="row">
                  <span className="grow">
                    {targetLabel(t, names)}: {formatTargetValue(t, settings)}
                  </span>
                  <button type="button" className="icon-btn" aria-label={`Remove ${targetLabel(t, names)} target`} onClick={() => setTargets(targets.filter((_, j) => j !== i))}>
                    <X size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AddTarget lifts={lifts ?? []} settings={settings} onAdd={(t) => setTargets([...targets.filter((x) => sameKind(x) !== sameKind(t)), t])} />
        </section>

        <section className="card stack-sm" aria-labelledby="goal-food-heading">
          <h2 id="goal-food-heading">Food</h2>
          <p className="muted small">Optional. Claude suggests these when it plans to the date.</p>
          <div className="row">
            <label className="field grow">
              <span>Calories a day</span>
              <input className="input" inputMode="numeric" value={calories} placeholder="kcal" onChange={(e) => setCalories(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="field grow">
              <span>Protein a day</span>
              <input className="input" inputMode="numeric" value={protein} placeholder="g" onChange={(e) => setProtein(e.target.value.replace(/\D/g, ''))} />
            </label>
          </div>
        </section>

        <button type="submit" className="btn btn-primary btn-block" disabled={!name.trim() || !targetDate}>
          <Flag size={18} aria-hidden /> {goal ? 'Save goal' : 'Set goal'}
        </button>
        {goal && (
          <button type="button" className="btn btn-block" onClick={onDone}>
            Cancel
          </button>
        )}
      </form>
    </>
  )
}

/** One target per kind (one per lift). */
const sameKind = (t: GoalTarget) => (t.kind === 'measurement' ? t.metric : t.kind === 'lift' ? `lift:${t.exerciseId}` : t.kind)

function formatTargetValue(t: GoalTarget, settings: Settings): string {
  if (t.kind === 'measurement') return formatAmount(t.value, t.metric === 'bodyfat' ? '%' : 'cm', settings.units)
  return formatAmount(t.value, 'weight', settings.units)
}

function AddTarget({ lifts, settings, onAdd }: { lifts: Exercise[]; settings: Settings; onAdd: (t: GoalTarget) => void }) {
  const [kind, setKind] = useState<Kind>('bodyweight')
  const [exerciseId, setExerciseId] = useState('')
  const [value, setValue] = useState('')
  const unit = unitOf(kind, settings)
  const number = Number(value)
  const ready = value.trim() !== '' && number > 0 && (kind !== 'lift' || !!(exerciseId || lifts[0]))

  const add = () => {
    if (!ready) return
    const weight = (v: number) => toKg(roundForDisplay(v, settings.units), settings.units)
    if (kind === 'bodyweight') onAdd({ kind, value: weight(number) })
    else if (kind === 'lift') onAdd({ kind, exerciseId: exerciseId || lifts[0].id, value: weight(number) })
    else onAdd({ kind: 'measurement', metric: kind, value: number })
    setValue('')
  }

  return (
    <div className="goal-add stack-sm">
      <div className="row">
        <select className="input grow" aria-label="Target" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k === 'lift' ? 'A lift (est. 1RM)' : METRIC_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {kind === 'lift' && (
        <select className="input" aria-label="Lift" value={exerciseId || lifts[0]?.id || ''} onChange={(e) => setExerciseId(e.target.value)}>
          {lifts.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      )}
      <div className="row">
        <input
          className="input grow"
          inputMode="decimal"
          aria-label={`Target value in ${unit}`}
          placeholder={`Target in ${unit}`}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="btn" onClick={add} disabled={!ready}>
          <Plus size={18} aria-hidden /> Add
        </button>
      </div>
    </div>
  )
}
