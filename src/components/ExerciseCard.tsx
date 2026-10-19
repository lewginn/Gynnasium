import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, EllipsisVertical, Info, Plus, Trash2, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addSet,
  completeSet,
  deleteSet,
  lastPerformance,
  moveSessionExercise,
  removeSessionExercise,
  swapSessionExercise,
  uncompleteSet,
  updateSet,
  type SessionDetail,
} from '../db/repo'
import { tapFeedback, unlockAudio } from '../lib/feedback'
import { swapSuggestions } from '../lib/suggest'
import { summariseSets } from '../lib/summary'
import type { Exercise, LoggingType, SetLog, SetType, Settings } from '../lib/types'
import { roundForDisplay, toDisplay, toKg, weightStep } from '../lib/units'
import ExercisePicker from './ExercisePicker'
import Sheet from './Sheet'
import Stepper from './Stepper'

interface Props {
  entry: SessionDetail['exercises'][number]
  sessionId: string
  settings: Settings
  library: Exercise[]
  first: boolean
  last: boolean
  /** Hidden when editing an old workout, where "last time" could be a later workout. */
  showLastTime?: boolean
  /** Called when a set is ticked off (not when un-ticked), with any PRs it set. */
  onSetDone: (prs: SetLog['prs']) => void
}

/** One exercise in a workout (live or being edited afterwards): its sets, and a menu to swap, move or remove it. */
export default function ExerciseCard({ entry, sessionId, settings, library, first, last, showLastTime = true, onSetDone }: Props) {
  const { se, exercise, sets } = entry
  const [menu, setMenu] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [setMenuFor, setSetMenuFor] = useState<SetLog | null>(null)
  const previous = useLiveQuery(() => lastPerformance(exercise.id, sessionId), [exercise.id, sessionId])
  const swaps = useMemo(() => (swapping ? swapSuggestions(library, exercise) : []), [swapping, library, exercise])
  const logging = exercise.logging

  const menuAction = (action: () => unknown) => () => {
    setMenu(false)
    void action()
  }

  let workingNumber = 0
  return (
    <section className="card exercise-card" aria-label={exercise.name}>
      <div className="title-row">
        <h2>{exercise.name}</h2>
        <button className="icon-btn" aria-label={`Options for ${exercise.name}`} onClick={() => setMenu(true)}>
          <EllipsisVertical size={20} />
        </button>
      </div>
      {showLastTime && (
        <p className="muted small last-time">
          {previous && previous.length > 0 ? <>Last time: {summariseSets(previous, settings, logging)}</> : 'First time doing this one'}
        </p>
      )}

      <div className={`set-grid ${settings.showRpe && logging !== 'time' ? 'with-rpe' : ''}`}>
        {/* Visual column headings; each control carries its own label for screen readers. */}
        <div className="set-grid-head" aria-hidden="true">
          <span>Set</span>
          <span>{logging === 'bodyweight' ? `+${settings.units}` : settings.units}</span>
          <span>{logging === 'time' ? 'Sec' : 'Reps'}</span>
          {settings.showRpe && logging !== 'time' && <span>RPE</span>}
          <span />
        </div>
        {sets.map((set) => {
          const label = set.setType === 'warmup' ? 'W' : set.setType === 'drop' ? 'D' : set.setType === 'failure' ? 'F' : String(++workingNumber)
          return (
            <SetRow
              key={set.id}
              set={set}
              label={label}
              logging={logging}
              settings={settings}
              onMenu={() => setSetMenuFor(set)}
              onDone={onSetDone}
            />
          )
        })}
      </div>
      {logging === 'bodyweight' && <p className="muted small hint">+{settings.units} is added weight; use a minus for assisted.</p>}

      <button className="btn btn-sm btn-block" onClick={() => addSet(se.id)}>
        <Plus size={18} aria-hidden /> Add set
      </button>

      {menu && (
        <Sheet title={exercise.name} onClose={() => setMenu(false)}>
          <div className="menu-list">
            <button className="menu-item" onClick={menuAction(() => setSwapping(true))}>
              <ArrowLeftRight size={20} aria-hidden /> Swap exercise
            </button>
            {!first && (
              <button className="menu-item" onClick={menuAction(() => moveSessionExercise(se.id, -1))}>
                <ArrowUp size={20} aria-hidden /> Move up
              </button>
            )}
            {!last && (
              <button className="menu-item" onClick={menuAction(() => moveSessionExercise(se.id, 1))}>
                <ArrowDown size={20} aria-hidden /> Move down
              </button>
            )}
            <Link className="menu-item" to={`/exercises/${encodeURIComponent(exercise.id)}`}>
              <Info size={20} aria-hidden /> History & details
            </Link>
            <button className="menu-item danger" onClick={menuAction(() => removeSessionExercise(se.id))}>
              <Trash2 size={20} aria-hidden /> Remove from workout
            </button>
          </div>
        </Sheet>
      )}

      {swapping && (
        <ExercisePicker
          title={`Swap ${exercise.name}`}
          onClose={() => setSwapping(false)}
          onPick={(e) => swapSessionExercise(se.id, e)}
          excludeIds={[exercise.id]}
          suggestions={swaps.map((e) => ({ exercise: e }))}
          suggestionsTitle="Works the same muscles"
        />
      )}

      {setMenuFor && (
        <Sheet title={`Set ${setMenuFor.setNumber}`} onClose={() => setSetMenuFor(null)}>
          <div className="segmented segmented-wrap" role="radiogroup" aria-label="Set type">
            {(
              [
                ['warmup', 'Warm-up'],
                ['working', 'Working'],
                ['drop', 'Drop set'],
                ['failure', 'To failure'],
              ] as [SetType, string][]
            ).map(([type, text]) => (
              <button
                key={type}
                role="radio"
                aria-checked={setMenuFor.setType === type}
                onClick={() => {
                  void updateSet(setMenuFor.id, { setType: type })
                  setSetMenuFor(null)
                }}
              >
                {text}
              </button>
            ))}
          </div>
          <p className="muted small">Warm-up sets don't count towards PRs or your history.</p>
          <button
            className="btn btn-danger-text btn-block"
            onClick={() => {
              void deleteSet(setMenuFor.id)
              setSetMenuFor(null)
            }}
          >
            <Trash2 size={18} aria-hidden /> Delete set
          </button>
        </Sheet>
      )}
    </section>
  )
}

function SetRow({
  set,
  label,
  logging,
  settings,
  onMenu,
  onDone,
}: {
  set: SetLog
  label: string
  logging: LoggingType
  settings: Settings
  onMenu: () => void
  onDone: (prs: SetLog['prs']) => void
}) {
  const done = !!set.completedAt
  const units = settings.units
  const weight = roundForDisplay(toDisplay(set.weightKg, units), units)
  const isPR = done && !!set.prs?.length
  const maxWeight = units === 'kg' ? 1000 : 2200

  return (
    <div className={`set-row ${done ? 'done' : ''} ${set.setType === 'warmup' ? 'warmup' : ''}`} role="group" aria-label={`Set ${label}`}>
      <button className="set-label" onClick={onMenu} aria-label={`Set ${label} options`}>
        {isPR ? <Trophy size={16} aria-label="PR" /> : label}
      </button>
      <Stepper
        label={`Set ${label} weight`}
        value={weight}
        step={weightStep(units)}
        // Bodyweight exercises go negative for assistance (e.g. -20kg on an assisted pull-up machine).
        min={logging === 'bodyweight' ? -maxWeight / 5 : 0}
        max={maxWeight}
        decimals
        onChange={(v) => updateSet(set.id, { weightKg: toKg(v, units) })}
      />
      {logging === 'time' ? (
        <Stepper
          label={`Set ${label} seconds`}
          value={set.durationSec ?? 0}
          step={5}
          max={3600}
          onChange={(durationSec) => updateSet(set.id, { durationSec })}
        />
      ) : (
        <Stepper label={`Set ${label} reps`} value={set.reps} step={1} max={100} onChange={(reps) => updateSet(set.id, { reps })} />
      )}
      {settings.showRpe && logging !== 'time' && (
        <select
          className="rpe-select"
          aria-label={`Set ${label} RPE`}
          value={set.rpe ?? ''}
          onChange={(e) => updateSet(set.id, { rpe: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">–</option>
          {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
      <button
        className="check-btn"
        aria-label={done ? `Undo set ${label}` : `Complete set ${label}`}
        aria-pressed={done}
        onClick={async () => {
          unlockAudio()
          tapFeedback()
          if (done) await uncompleteSet(set.id)
          else onDone(await completeSet(set.id))
        }}
      >
        <Check size={22} strokeWidth={3} />
      </button>
    </div>
  )
}
