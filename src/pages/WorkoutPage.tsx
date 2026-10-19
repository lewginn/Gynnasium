import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftRight, Check, ChevronLeft, EllipsisVertical, Info, Pause, Plus, Trash2, Trophy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ExercisePicker from '../components/ExercisePicker'
import RestTimerBar from '../components/RestTimerBar'
import Sheet from '../components/Sheet'
import Stepper from '../components/Stepper'
import { db } from '../db/db'
import {
  addSessionExercise,
  addSet,
  alive,
  completeSet,
  deleteSet,
  discardSession,
  finishSession,
  getActiveSession,
  lastPerformance,
  loadSession,
  removeSessionExercise,
  swapSessionExercise,
  uncompleteSet,
  updateSet,
  type SessionDetail,
} from '../db/repo'
import { useSettings } from '../db/settings'
import { tapFeedback, unlockAudio } from '../lib/feedback'
import { formatClock } from '../lib/format'
import { PR_LABELS } from '../lib/prs'
import { suggestExercises, swapSuggestions } from '../lib/suggest'
import { summariseSets } from '../lib/summary'
import type { Exercise, SetLog, SetType, Settings } from '../lib/types'
import { roundForDisplay, toDisplay, toKg, weightStep } from '../lib/units'
import { restTimer, useNow } from '../state/restTimer'
import { useWakeLock } from '../state/wakeLock'

type ExerciseEntry = SessionDetail['exercises'][number]

export default function WorkoutPage() {
  const navigate = useNavigate()
  const settings = useSettings()
  const sessionId = useLiveQuery(async () => (await getActiveSession())?.id ?? null)
  const detail = useLiveQuery(async () => (sessionId ? await loadSession(sessionId) : null), [sessionId])
  const library = useLiveQuery(() => db.exercises.toArray())
  // Rest times and focus come from the plan day the workout was started from.
  const plan = useLiveQuery(async () => {
    const dayId = detail?.session.planDayId
    if (!dayId) return null
    const day = await db.planDays.get(dayId)
    const pes = await db.planExercises.where('planDayId').equals(dayId).filter(alive).toArray()
    return { day, restByExercise: new Map(pes.map((pe) => [pe.exerciseId, pe.restSec])) }
  }, [detail?.session.planDayId])
  const [picking, setPicking] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [prToast, setPrToast] = useState<string | null>(null)
  const now = useNow(1000)

  useWakeLock(!!detail)
  useEffect(() => {
    if (sessionId === null) navigate('/', { replace: true })
  }, [sessionId, navigate])
  useEffect(() => {
    if (!prToast) return
    const t = setTimeout(() => setPrToast(null), 3500)
    return () => clearTimeout(t)
  }, [prToast])

  if (!detail) return <p className="muted">Loading…</p>
  const { session, exercises } = detail
  const doneSets = exercises.flatMap((e) => e.sets).filter((s) => s.completedAt).length

  const restFor = (exercise: Exercise) => plan?.restByExercise.get(exercise.id) ?? exercise.defaultRestSec ?? settings.defaultRestSec

  const finish = async () => {
    if (doneSets === 0 && !confirm('No sets ticked off yet. Finish and discard this workout?')) return
    const pendingSets = exercises.flatMap((e) => e.sets).filter((s) => !s.completedAt).length
    if (doneSets > 0 && pendingSets > 0 && !confirm(`${pendingSets} sets aren't ticked off. Finish anyway? They won't be saved.`)) return
    restTimer.dismiss()
    const kept = await finishSession(session.id)
    navigate(kept ? `/history/${session.id}` : '/', { replace: true })
  }

  const discard = async () => {
    if (!confirm('Discard this workout? Nothing from it will be saved.')) return
    restTimer.dismiss()
    await discardSession(session.id)
    navigate('/', { replace: true })
  }

  return (
    <div className="workout">
      <header className="workout-header">
        <button className="icon-btn" aria-label="Leave workout" onClick={() => setLeaving(true)}>
          <ChevronLeft size={26} />
        </button>
        <div className="grow">
          <h1>{session.name}</h1>
          <span className="muted small" aria-label="Elapsed time">
            {formatClock((now - session.startedAt) / 1000)} · {doneSets} {doneSets === 1 ? 'set' : 'sets'}
          </span>
        </div>
        <button className="btn btn-primary" onClick={finish}>
          Finish
        </button>
      </header>

      {exercises.length === 0 && (
        <section className="card empty">
          <h2>Empty workout</h2>
          <p className="muted">Add exercises as you go.</p>
        </section>
      )}

      {exercises.map((entry) => (
        <ExerciseCard
          key={entry.se.id}
          entry={entry}
          sessionId={session.id}
          settings={settings}
          library={library ?? []}
          onSetDone={(prs) => {
            restTimer.start(restFor(entry.exercise), entry.exercise.name)
            // The headline PR is enough mid-set; the summary lists them all.
            if (prs?.length) setPrToast(`${PR_LABELS[prs[0]]} on ${entry.exercise.name}`)
          }}
        />
      ))}

      <button className="btn btn-block" onClick={() => setPicking(true)}>
        <Plus size={20} aria-hidden /> Add exercise
      </button>
      <button className="btn btn-danger-text btn-block btn-sm" onClick={discard}>
        Discard workout
      </button>

      {leaving && (
        <Sheet title="Leave workout?" onClose={() => setLeaving(false)}>
          <div className="menu-list">
            <button className="menu-item" onClick={() => navigate('/')}>
              <Pause size={20} aria-hidden />
              <span>
                Keep it for later
                <span className="muted small block">Carry on any time from Today. Nothing is lost.</span>
              </span>
            </button>
            <button className="menu-item danger" onClick={discard}>
              <Trash2 size={20} aria-hidden />
              <span>
                Discard workout
                <span className="muted small block">Delete it without saving anything.</span>
              </span>
            </button>
          </div>
        </Sheet>
      )}

      {prToast && (
        <div className="toast" role="status">
          <Trophy size={24} aria-hidden />
          <span>
            <strong className="block">New PR!</strong>
            <span className="small">{prToast}</span>
          </span>
        </div>
      )}

      <RestTimerBar />

      {picking && (
        <ExercisePicker
          title="Add exercise"
          onClose={() => setPicking(false)}
          onPick={(e) => addSessionExercise(session.id, e)}
          excludeIds={exercises.map((e) => e.exercise.id)}
          suggestions={
            plan?.day ? suggestExercises(library ?? [], plan.day.focusMuscles, exercises.map((e) => e.exercise), 5) : []
          }
          suggestionsTitle={plan?.day ? `Suggested for ${plan.day.name}` : undefined}
        />
      )}
    </div>
  )
}

function ExerciseCard({
  entry,
  sessionId,
  settings,
  library,
  onSetDone,
}: {
  entry: ExerciseEntry
  sessionId: string
  settings: Settings
  library: Exercise[]
  onSetDone: (prs: SetLog['prs']) => void
}) {
  const { se, exercise, sets } = entry
  const [menu, setMenu] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [setMenuFor, setSetMenuFor] = useState<SetLog | null>(null)
  const last = useLiveQuery(() => lastPerformance(exercise.id, sessionId), [exercise.id, sessionId])
  const swaps = useMemo(() => (swapping ? swapSuggestions(library, exercise) : []), [swapping, library, exercise])

  let workingNumber = 0
  return (
    <section className="card exercise-card" aria-label={exercise.name}>
      <div className="title-row">
        <h2>{exercise.name}</h2>
        <button className="icon-btn" aria-label={`Options for ${exercise.name}`} onClick={() => setMenu(true)}>
          <EllipsisVertical size={20} />
        </button>
      </div>
      <p className="muted small last-time">
        {last && last.length > 0 ? <>Last time: {summariseSets(last, settings)}</> : 'First time doing this one'}
      </p>

      <div className={`set-grid ${settings.showRpe ? 'with-rpe' : ''}`}>
        {/* Visual column headings; each control carries its own label for screen readers. */}
        <div className="set-grid-head" aria-hidden="true">
          <span>Set</span>
          <span>{settings.units}</span>
          <span>Reps</span>
          {settings.showRpe && <span>RPE</span>}
          <span />
        </div>
        {sets.map((set) => {
          const label = set.setType === 'warmup' ? 'W' : set.setType === 'drop' ? 'D' : set.setType === 'failure' ? 'F' : String(++workingNumber)
          return (
            <SetRow key={set.id} set={set} label={label} settings={settings} onMenu={() => setSetMenuFor(set)} onDone={onSetDone} />
          )
        })}
      </div>

      <button className="btn btn-sm btn-block" onClick={() => addSet(se.id)}>
        <Plus size={18} aria-hidden /> Add set
      </button>

      {menu && (
        <Sheet title={exercise.name} onClose={() => setMenu(false)}>
          <div className="menu-list">
            <button
              className="menu-item"
              onClick={() => {
                setMenu(false)
                setSwapping(true)
              }}
            >
              <ArrowLeftRight size={20} aria-hidden /> Swap exercise
            </button>
            <Link className="menu-item" to={`/exercises/${encodeURIComponent(exercise.id)}`}>
              <Info size={20} aria-hidden /> History & details
            </Link>
            <button
              className="menu-item danger"
              onClick={() => {
                setMenu(false)
                void removeSessionExercise(se.id)
              }}
            >
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
  settings,
  onMenu,
  onDone,
}: {
  set: SetLog
  label: string
  settings: Settings
  onMenu: () => void
  onDone: (prs: SetLog['prs']) => void
}) {
  const done = !!set.completedAt
  const units = settings.units
  const weight = roundForDisplay(toDisplay(set.weightKg, units), units)
  const isPR = done && !!set.prs?.length

  return (
    <div className={`set-row ${done ? 'done' : ''} ${set.setType === 'warmup' ? 'warmup' : ''}`} role="group" aria-label={`Set ${label}`}>
      <button className="set-label" onClick={onMenu} aria-label={`Set ${label} options`}>
        {isPR ? <Trophy size={16} aria-label="PR" /> : label}
      </button>
      <Stepper
        label={`Set ${label} weight`}
        value={weight}
        step={weightStep(units)}
        max={units === 'kg' ? 1000 : 2200}
        decimals
        onChange={(v) => updateSet(set.id, { weightKg: toKg(v, units) })}
      />
      <Stepper label={`Set ${label} reps`} value={set.reps} step={1} max={100} onChange={(reps) => updateSet(set.id, { reps })} />
      {settings.showRpe && (
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
