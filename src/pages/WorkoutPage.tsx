import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Pause, Plus, Trash2, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ExerciseCard from '../components/ExerciseCard'
import ExercisePicker from '../components/ExercisePicker'
import RestTimerBar from '../components/RestTimerBar'
import Sheet from '../components/Sheet'
import { db } from '../db/db'
import { addSessionExercise, alive, discardSession, finishSession, getActiveSession, loadSession } from '../db/repo'
import { useSettings } from '../db/settings'
import { formatClock } from '../lib/format'
import { PR_LABELS } from '../lib/prs'
import { suggestExercises } from '../lib/suggest'
import type { Exercise } from '../lib/types'
import { restTimer, useNow } from '../state/restTimer'
import { useWakeLock } from '../state/wakeLock'

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

      {exercises.map((entry, i) => (
        <ExerciseCard
          key={entry.se.id}
          entry={entry}
          first={i === 0}
          last={i === exercises.length - 1}
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
