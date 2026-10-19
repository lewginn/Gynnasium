import { useState } from 'react'
import { deleteSet, logSet, removeExercise, startRest, updateSet, type WorkoutItem } from '../../db/workout'
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../../lib/labels'
import type { PRType } from '../../lib/prs'
import type { SetLog, Units } from '../../lib/types'
import { roundForDisplay, toDisplay, toKg, weightStep } from '../../lib/units'
import { defaultSet, plannedSetCount, suggestSet } from '../../lib/workout'
import ActionSheet from '../ActionSheet'
import Icon from '../Icon'
import Stepper from '../Stepper'

const RPE_OPTIONS = [6, 7, 8, 9, 10]

type Props = {
  item: WorkoutItem
  prs: Map<string, PRType[]>
  units: Units
  showRpe: boolean
  defaultRestSec: number
  active: boolean
  onActivate: () => void
  next?: { name: string; go: () => void }
}

const display = (kg: number, units: Units) => roundForDisplay(toDisplay(kg, units), units)

function SetValue({ weightKg, reps, units }: { weightKg: number; reps: number; units: Units }) {
  return (
    <span className="set-value num">
      {weightKg > 0 && (
        <>
          {display(weightKg, units)}
          <small>{units}</small>
          <span className="set-times">×</span>
        </>
      )}
      {reps}
      {weightKg === 0 && <small>reps</small>}
    </span>
  )
}

export default function ExerciseCard({ item, prs, units, showRpe, defaultRestSec, active, onActivate, next }: Props) {
  const { sessionExercise, exercise, sets, previous } = item
  const [extra, setExtra] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const name = exercise?.name ?? 'Unknown exercise'
  const planned = plannedSetCount(sets.length, previous.length, extra)
  const meta = exercise
    ? `${exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} · ${EQUIPMENT_LABELS[exercise.equipment]}`
    : ''

  if (!active) {
    const complete = sets.length > 0 && sets.length >= planned
    const best = sets.reduce<SetLog | null>((a, b) => (!a || b.weightKg * b.reps > a.weightKg * a.reps ? b : a), null)
    const summary = best
      ? `${sets.length} ${sets.length === 1 ? 'set' : 'sets'} · best ${display(best.weightKg, units)} ${units} × ${best.reps}`
      : previous.length > 0
        ? `Last time ${display(previous[0].weightKg, units)} ${units} × ${previous[0].reps}`
        : meta
    return (
      <button className="ex-card ex-collapsed" onClick={onActivate}>
        <span className={`ex-progress num${complete ? ' complete' : ''}`} aria-hidden="true">
          {complete ? <Icon name="check" size={16} /> : `${sets.length}/${planned}`}
        </span>
        <span className="row-body">
          <span className="ex-name">{name}</span>
          <span className="ex-meta">{summary}</span>
        </span>
        <Icon name="chevronRight" size={16} className="row-chevron" />
      </button>
    )
  }

  const restAfterSet = () => startRest(exercise?.defaultRestSec ?? defaultRestSec)

  const rows = Array.from({ length: planned }, (_, i) => {
    const set = sets[i]
    if (set && editing === set.id)
      return (
        <FocusSet
          key={set.id}
          number={i + 1}
          initial={set}
          previous={previous[i]}
          units={units}
          showRpe={showRpe}
          onSubmit={async (input) => {
            await updateSet(set.id, input)
            setEditing(null)
          }}
          onDelete={async () => {
            await deleteSet(set.id)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )
    if (set)
      return (
        <li key={set.id}>
          <button className="set-row done" aria-label={`Edit set ${i + 1}`} onClick={() => setEditing(set.id)}>
            <span className="set-number num">{i + 1}</span>
            <SetValue weightKg={set.weightKg} reps={set.reps} units={units} />
            {set.rpe !== undefined && <span className="set-rpe num">@{set.rpe}</span>}
            {prs.has(set.id) && (
              <span className="pr-badge">
                <Icon name="star" size={12} />
                PR
              </span>
            )}
            <span className="set-check">
              <Icon name="check" size={16} />
            </span>
          </button>
        </li>
      )
    const suggestion = suggestSet(i, sets, previous)
    if (i === sets.length && !editing)
      return (
        <FocusSet
          key={`next-${i}`}
          number={i + 1}
          initial={suggestion ?? defaultSet(exercise?.equipment)}
          previous={previous[i]}
          units={units}
          showRpe={showRpe}
          onSubmit={async (input) => {
            navigator.vibrate?.(15)
            await logSet(sessionExercise, input)
            await restAfterSet()
          }}
        />
      )
    return (
      <li key={`pending-${i}`} className="set-row pending">
        <span className="set-number num">{i + 1}</span>
        {suggestion ? <SetValue {...suggestion} units={units} /> : <span className="set-value">—</span>}
      </li>
    )
  })

  const allDone = sets.length >= planned && !editing

  return (
    <section className="ex-card ex-active" aria-label={name}>
      <header className="ex-header">
        <div className="row-body">
          <h2 className="ex-name">{name}</h2>
          <p className="ex-meta">{meta}</p>
        </div>
        <button className="icon-button" aria-label={`Options for ${name}`} onClick={() => setMenuOpen(true)}>
          <Icon name="ellipsis" size={20} />
        </button>
      </header>
      <ol className="set-list">{rows}</ol>
      <div className="ex-footer">
        <button className="btn-plain" onClick={() => setExtra(extra + 1)}>
          <Icon name="plus" size={18} />
          Add set
        </button>
        {allDone && next && (
          <button className="btn btn-filled btn-next" onClick={next.go}>
            Next: {next.name}
          </button>
        )}
      </div>
      <ActionSheet
        open={menuOpen}
        title={name}
        actions={[
          ...(extra > 0 && sets.length < planned ? [{ label: 'Remove empty set', onSelect: () => setExtra(extra - 1) }] : []),
          { label: 'Remove exercise', destructive: true, onSelect: () => removeExercise(sessionExercise.id) },
        ]}
        onClose={() => setMenuOpen(false)}
      />
    </section>
  )
}

type SetInput = Pick<SetLog, 'weightKg' | 'reps' | 'rpe'>

type FocusProps = {
  number: number
  initial: SetInput
  previous?: SetLog
  units: Units
  showRpe: boolean
  onSubmit: (input: SetInput) => Promise<void>
  onDelete?: () => Promise<void>
  onCancel?: () => void
}

/** The set you're about to do: big steppers pre-filled from last time, and one button to log it. */
function FocusSet({ number, initial, previous, units, showRpe, onSubmit, onDelete, onCancel }: FocusProps) {
  const [weight, setWeight] = useState(() => display(initial.weightKg, units))
  const [reps, setReps] = useState(initial.reps)
  const [rpe, setRpe] = useState(initial.rpe)
  const [busy, setBusy] = useState(false)
  const editing = !!onDelete

  const submit = async () => {
    setBusy(true)
    try {
      await onSubmit({ weightKg: toKg(weight, units), reps, rpe: showRpe ? rpe : initial.rpe })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="focus-set" aria-label={`Set ${number}`}>
      <div className="focus-head">
        <span className="focus-label">{editing ? `Edit set ${number}` : `Set ${number}`}</span>
        {previous && (
          <span className="focus-prev">
            Last time{' '}
            <span className="num">
              {previous.weightKg > 0 && `${display(previous.weightKg, units)} ${units} × `}
              {previous.reps}
            </span>
          </span>
        )}
      </div>
      <Stepper label="Weight" unit={units} value={weight} step={weightStep(units)} onChange={setWeight} />
      <Stepper label="Reps" unit="reps" value={reps} step={1} min={1} onChange={(v) => setReps(Math.round(v))} />
      {showRpe && (
        <div className="rpe-row" role="radiogroup" aria-label="RPE">
          <span className="rpe-label">RPE</span>
          {RPE_OPTIONS.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={rpe === r}
              className="chip num"
              onClick={() => setRpe(rpe === r ? undefined : r)}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      {editing ? (
        <div className="focus-actions">
          <button className="btn btn-gray btn-destructive" onClick={onDelete} disabled={busy}>
            Delete
          </button>
          <button className="btn btn-gray" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-filled" onClick={submit} disabled={busy}>
            Save
          </button>
        </div>
      ) : (
        <button className="btn btn-filled btn-log" onClick={submit} disabled={busy}>
          <Icon name="check" size={20} />
          Log set
        </button>
      )}
    </li>
  )
}
