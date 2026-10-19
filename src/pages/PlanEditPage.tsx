import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronLeft, ChevronUp, MessagesSquare, Pencil, Play, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ExercisePicker from '../components/ExercisePicker'
import Sheet from '../components/Sheet'
import Stepper from '../components/Stepper'
import { db } from '../db/db'
import {
  addPlanDay,
  addPlanExercise,
  deletePlan,
  deletePlanDay,
  deletePlanExercise,
  getActiveSession,
  loadPlan,
  movePlanExercise,
  setActivePlan,
  setAlternatingWeeks,
  startSession,
  updatePlan,
  updatePlanDay,
  updatePlanExercise,
  type PlanDetail,
} from '../db/repo'
import { formatRest, formatTarget } from '../lib/format'
import { MUSCLE_LABELS } from '../lib/labels'
import { KEY_MUSCLES, suggestExercises, weeklySetsByMuscle } from '../lib/suggest'
import type { Exercise, Muscle, PlanDay, PlanExercise } from '../lib/types'
import { alternates, dayLabel, weekLetter } from '../lib/weeks'
import { useConfirm } from '../state/confirm'

const REST_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300]

export default function PlanEditPage() {
  const { planId = '' } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const detail = useLiveQuery(async () => (await loadPlan(planId)) ?? null, [planId])
  const library = useLiveQuery(() => db.exercises.toArray())
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<'plan' | 'day' | 'newDay' | null>(null)
  const [picking, setPicking] = useState(false)
  const [newDayWeek, setNewDayWeek] = useState<PlanDay['week']>(undefined)

  if (detail === undefined) return <p className="muted">Loading…</p>
  if (detail === null)
    return (
      <section className="card">
        <h2>Plan not found</h2>
        <Link to="/plans">Back to plans</Link>
      </section>
    )

  const { plan, days } = detail
  const alternating = alternates(days.map((d) => d.day))
  const selected = days.find((d) => d.day.id === selectedDayId) ?? days[0]

  const startDay = async (dayId: string) => {
    if (await getActiveSession()) return navigate('/workout')
    await startSession(dayId)
    navigate('/workout')
  }

  return (
    <>
      <header className="page-header">
        <Link to="/plans" className="back-link">
          <ChevronLeft size={18} aria-hidden /> Plans
        </Link>
        <div className="title-row">
          <h1>{plan.name}</h1>
          <button className="icon-btn" aria-label="Rename plan" onClick={() => setRenaming('plan')}>
            <Pencil size={18} />
          </button>
        </div>
        <div className="row plan-actions">
          {plan.isActive ? (
            <span className="badge grow">Active plan</span>
          ) : (
            <button className="btn btn-sm" onClick={() => setActivePlan(plan.id)}>
              Make active
            </button>
          )}
          <Link to={`/plans/${plan.id}/coach`} className="btn btn-sm">
            <MessagesSquare size={16} aria-hidden /> Ask Claude
          </Link>
        </div>
      </header>

      {(alternating ? ([1, 2] as const) : [undefined]).map((week) => (
        <div key={week ?? 0} className="day-tabs-group">
          {week && <h2 className="section-label day-tabs-label">Week {weekLetter(week)}</h2>}
          <div className="chips day-tabs" role="group" aria-label={week ? `Week ${weekLetter(week)} days` : 'Days'}>
            {days
              .filter(({ day }) => !week || (day.week ?? 1) === week)
              .map(({ day }) => (
                <button
                  key={day.id}
                  className="chip"
                  aria-pressed={day.id === selected?.day.id}
                  aria-label={week ? dayLabel(day) : undefined}
                  onClick={() => setSelectedDayId(day.id)}
                >
                  {day.name}
                </button>
              ))}
            <button
              className="chip chip-add"
              aria-label={week ? `Add day to week ${weekLetter(week)}` : undefined}
              onClick={() => {
                setNewDayWeek(week)
                setRenaming('newDay')
              }}
            >
              <Plus size={16} aria-hidden /> Add day
            </button>
          </div>
        </div>
      ))}

      {selected ? (
        <DayEditor
          key={selected.day.id}
          dayDetail={selected}
          library={library ?? []}
          onRename={() => setRenaming('day')}
          onAddExercise={() => setPicking(true)}
          onStart={() => startDay(selected.day.id)}
        />
      ) : (
        <section className="card empty">
          <h2>Add your first day</h2>
          <p className="muted">Name it after what you train, like "Push", "Back & Biceps" or "Legs", and you'll get exercise suggestions for it.</p>
          <button className="btn btn-primary btn-block" onClick={() => setRenaming('newDay')}>
            <Plus size={20} aria-hidden /> Add day
          </button>
        </section>
      )}

      {days.some((d) => d.exercises.length > 0) && <WeeklyVolume days={days} />}

      <section className="card">
        <label className="toggle">
          <span>
            Alternate weeks
            <span className="muted small block">Week A and week B have different days. Up next runs through week A, then week B.</span>
          </span>
          <input type="checkbox" checked={alternating} onChange={(e) => setAlternatingWeeks(plan.id, e.target.checked)} />
        </label>
      </section>

      <button
        className="btn btn-danger-text btn-block"
        onClick={async () => {
          if (await confirm({ title: `Delete ${plan.name}?`, message: 'Workouts you’ve logged are kept.', action: 'Delete plan', destructive: true })) {
            await deletePlan(plan.id)
            navigate('/plans')
          }
        }}
      >
        Delete plan
      </button>

      {picking && selected && (
        <ExercisePicker
          title={`Add to ${selected.day.name}`}
          onClose={() => setPicking(false)}
          onPick={(e) => addPlanExercise(selected.day.id, e)}
          excludeIds={selected.exercises.map((x) => x.exercise.id)}
          suggestions={suggestExercises(library ?? [], selected.day.focusMuscles, selected.exercises.map((x) => x.exercise))}
          suggestionsTitle={`Suggested for ${selected.day.name}`}
        />
      )}

      {renaming && (
        <NameSheet
          title={renaming === 'plan' ? 'Rename plan' : renaming === 'day' ? 'Rename day' : 'New day'}
          initial={renaming === 'plan' ? plan.name : renaming === 'day' ? (selected?.day.name ?? '') : ''}
          placeholder={renaming === 'plan' ? 'Plan name' : 'e.g. Push, Back & Biceps, Legs'}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            if (renaming === 'plan') await updatePlan(plan.id, { name })
            else if (renaming === 'day' && selected) await updatePlanDay(selected.day.id, { name })
            else setSelectedDayId(await addPlanDay(plan.id, name, alternating ? (newDayWeek ?? 1) : undefined))
          }}
        />
      )}
    </>
  )
}

function DayEditor({
  dayDetail,
  library,
  onRename,
  onAddExercise,
  onStart,
}: {
  dayDetail: PlanDetail['days'][number]
  library: Exercise[]
  onRename: () => void
  onAddExercise: () => void
  onStart: () => void
}) {
  const { day, exercises } = dayDetail
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingFocus, setEditingFocus] = useState(false)
  const suggestions = useMemo(
    () => suggestExercises(library, day.focusMuscles, exercises.map((x) => x.exercise), 3),
    [library, day.focusMuscles, exercises],
  )

  return (
    <section className="card day-card" aria-label={day.name}>
      <div className="title-row">
        <h2>{day.name}</h2>
        <button className="icon-btn" aria-label="Rename day" onClick={onRename}>
          <Pencil size={16} />
        </button>
      </div>

      {day.week && (
        <div className="segmented day-week" role="radiogroup" aria-label="Week">
          {([1, 2] as const).map((w) => (
            <button key={w} role="radio" aria-checked={day.week === w} onClick={() => updatePlanDay(day.id, { week: w })}>
              Week {weekLetter(w)}
            </button>
          ))}
        </div>
      )}

      <button className="focus-line" onClick={() => setEditingFocus(true)}>
        {day.focusMuscles.length > 0 ? (
          <>Focus: {day.focusMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}</>
        ) : (
          <>Set which muscles this day trains, for suggestions</>
        )}
        <Pencil size={14} aria-hidden />
      </button>

      {exercises.length > 0 && (
        <ol className="plan-exercises">
          {exercises.map(({ pe, exercise }, i) => (
            <PlanExerciseRow
              key={pe.id}
              pe={pe}
              exercise={exercise}
              first={i === 0}
              last={i === exercises.length - 1}
              expanded={expanded === pe.id}
              onToggle={() => setExpanded(expanded === pe.id ? null : pe.id)}
            />
          ))}
        </ol>
      )}

      <button className="btn btn-block" onClick={onAddExercise}>
        <Plus size={20} aria-hidden /> Add exercise
      </button>

      {suggestions.length > 0 && (
        <section className="inline-suggestions" aria-label="Suggestions">
          <h3 className="section-label">
            <Sparkles size={14} aria-hidden /> Suggested
          </h3>
          {suggestions.map(({ exercise, reason }) => (
            <button key={exercise.id} className="suggestion" onClick={() => addPlanExercise(day.id, exercise)} aria-label={`Add ${exercise.name}`}>
              <Plus size={18} aria-hidden />
              <span>
                <span className="list-title">{exercise.name}</span>
                <span className="list-meta">{reason}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {exercises.length > 0 && (
        <button className="btn btn-primary btn-block" onClick={onStart}>
          <Play size={18} aria-hidden /> Start {day.name}
        </button>
      )}
      <button
        className="btn btn-danger-text btn-block btn-sm"
        onClick={async () => (await confirm({ title: `Delete ${day.name}?`, action: 'Delete day', destructive: true })) && deletePlanDay(day.id)}
      >
        Delete day
      </button>

      {editingFocus && (
        <FocusSheet
          selected={day.focusMuscles}
          onClose={() => setEditingFocus(false)}
          onChange={(focusMuscles) => updatePlanDay(day.id, { focusMuscles })}
        />
      )}
    </section>
  )
}

function PlanExerciseRow({
  pe,
  exercise,
  first,
  last,
  expanded,
  onToggle,
}: {
  pe: PlanExercise
  exercise: Exercise
  first: boolean
  last: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const update = (patch: Parameters<typeof updatePlanExercise>[1]) => updatePlanExercise(pe.id, patch)
  const timed = exercise.logging === 'time'
  const unit = timed ? 'sec' : 'reps'
  return (
    <li className={`plan-exercise ${expanded ? 'expanded' : ''}`}>
      <button className="plan-exercise-summary" onClick={onToggle} aria-expanded={expanded}>
        <span>
          <span className="list-title">{exercise.name}</span>
          <span className="list-meta">
            {formatTarget(pe.targetSets, pe.repMin, pe.repMax, exercise.logging)} · rest {formatRest(pe.restSec)}
          </span>
        </span>
        <ChevronDown size={18} aria-hidden className="chevron" />
      </button>
      {expanded && (
        <div className="plan-exercise-editor">
          <div className="editor-grid">
            <span>Sets</span>
            <Stepper label="Sets" value={pe.targetSets} step={1} min={1} max={10} onChange={(targetSets) => update({ targetSets })} />
            <span>Min {unit}</span>
            <Stepper
              label={`Min ${unit}`}
              value={pe.repMin}
              step={timed ? 5 : 1}
              min={1}
              max={timed ? 600 : 50}
              onChange={(repMin) => update({ repMin, repMax: Math.max(repMin, pe.repMax) })}
            />
            <span>Max {unit}</span>
            <Stepper
              label={`Max ${unit}`}
              value={pe.repMax}
              step={timed ? 5 : 1}
              min={1}
              max={timed ? 600 : 50}
              onChange={(repMax) => update({ repMax, repMin: Math.min(repMax, pe.repMin) })}
            />
            <span>Rest</span>
            <select className="input" aria-label="Rest" value={pe.restSec} onChange={(e) => update({ restSec: Number(e.target.value) })}>
              {[...new Set([...REST_OPTIONS, pe.restSec])]
                .sort((a, b) => a - b)
                .map((s) => (
                  <option key={s} value={s}>
                    {formatRest(s)}
                  </option>
                ))}
            </select>
          </div>
          <div className="row">
            <button className="icon-btn" aria-label="Move up" disabled={first} onClick={() => movePlanExercise(pe.id, -1)}>
              <ChevronUp size={20} />
            </button>
            <button className="icon-btn" aria-label="Move down" disabled={last} onClick={() => movePlanExercise(pe.id, 1)}>
              <ChevronDown size={20} />
            </button>
            <Link to={`/exercises/${encodeURIComponent(exercise.id)}`} className="btn btn-sm grow">
              Details
            </Link>
            <button className="icon-btn danger" aria-label={`Remove ${exercise.name}`} onClick={() => deletePlanExercise(pe.id)}>
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function WeeklyVolume({ days }: { days: PlanDetail['days'] }) {
  // With alternating weeks, a week A or B day comes round every other week: count it as half.
  const totals = weeklySetsByMuscle(
    days.flatMap((d) => d.exercises.map((x) => ({ exercise: x.exercise, sets: d.day.week ? x.pe.targetSets / 2 : x.pe.targetSets }))),
  )
  const alternating = alternates(days.map((d) => d.day))
  const max = Math.max(20, ...totals.values())
  const missing = KEY_MUSCLES.filter((m) => !totals.get(m))
  return (
    <section className="card" aria-label="Weekly sets per muscle">
      <h2>Weekly sets per muscle</h2>
      <p className="muted small">
        {alternating ? 'Averaged over weeks A and B.' : 'Doing each day once a week.'} 10 or more hard sets per muscle (green) is a typical target.
      </p>
      <ul className="volume-bars">
        {KEY_MUSCLES.map((m) => {
          const sets = totals.get(m) ?? 0
          return (
            <li key={m}>
              <span className="volume-label">{MUSCLE_LABELS[m]}</span>
              <span className="volume-track">
                <span className={`volume-fill ${sets >= 10 ? 'good' : sets > 0 ? 'low' : ''}`} style={{ width: `${(sets / max) * 100}%` }} />
              </span>
              <span className="volume-value">{Number(sets.toFixed(1))}</span>
            </li>
          )
        })}
      </ul>
      {missing.length > 0 && (
        <p className="warning small">
          <TriangleAlert size={16} aria-hidden /> Nothing for {missing.map((m) => MUSCLE_LABELS[m].toLowerCase()).join(', ')} yet.
        </p>
      )}
    </section>
  )
}

function NameSheet({
  title,
  initial,
  placeholder,
  onClose,
  onSave,
}: {
  title: string
  initial: string
  placeholder: string
  onClose: () => void
  onSave: (name: string) => Promise<void> | void
}) {
  const [value, setValue] = useState(initial)
  return (
    <Sheet title={title} onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!value.trim()) return
          await onSave(value.trim())
          onClose()
        }}
      >
        <input className="input" aria-label={title} autoFocus value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-block" disabled={!value.trim()}>
          Save
        </button>
      </form>
    </Sheet>
  )
}

const FOCUS_GROUPS: [string, Muscle[]][] = [
  ['Upper', ['chest', 'shoulders', 'lats', 'upper_back', 'traps', 'biceps', 'triceps', 'forearms']],
  ['Lower', ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors']],
  ['Core', ['abs', 'lower_back']],
]

function FocusSheet({ selected: initial, onClose, onChange }: { selected: Muscle[]; onClose: () => void; onChange: (m: Muscle[]) => void }) {
  // Kept locally so quick taps build on each other instead of on the last saved value.
  const [selected, setSelected] = useState(initial)
  const toggle = (m: Muscle) => {
    const next = selected.includes(m) ? selected.filter((x) => x !== m) : [...selected, m]
    setSelected(next)
    onChange(next)
  }
  return (
    <Sheet title="Muscles this day trains" onClose={onClose}>
      {FOCUS_GROUPS.map(([label, muscles]) => (
        <div key={label} className="stack-sm">
          <h3 className="section-label">{label}</h3>
          <div className="chip-wrap">
            {muscles.map((m) => (
              <button key={m} className="chip chip-sm" aria-pressed={selected.includes(m)} onClick={() => toggle(m)}>
                {MUSCLE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="btn btn-primary btn-block" onClick={onClose}>
        Done
      </button>
    </Sheet>
  )
}
