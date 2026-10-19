import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import ActionSheet from '../components/ActionSheet'
import Icon from '../components/Icon'
import Page from '../components/Page'
import ExerciseCard from '../components/workout/ExerciseCard'
import RestPill from '../components/workout/RestTimer'
import { useSettings } from '../db/settings'
import { discardWorkout, finishWorkout, useActiveSession, useWorkout, type WorkoutItem } from '../db/workout'
import { useNow } from '../hooks/useNow'
import { PR_LABELS } from '../lib/prs'
import { toDisplay } from '../lib/units'
import { formatDuration, plannedSetCount, sessionVolumeKg } from '../lib/workout'

const incomplete = (i: WorkoutItem) => i.sets.length < plannedSetCount(i.sets.length, i.previous.length)

export default function WorkoutPage() {
  const session = useActiveSession()
  const data = useWorkout(session?.id)
  const settings = useSettings()
  const now = useNow(1000, !!session)
  const navigate = useNavigate()
  const location = useLocation()
  const [activeId, setActiveId] = useState<string | null>((location.state as { activeId?: string } | null)?.activeId ?? null)
  const [finishing, setFinishing] = useState(false)
  const [toast, setToast] = useState<{ title: string; detail: string } | null>(null)

  // Celebrate PRs as they happen, but not the ones already on screen when the page opens.
  const seenPRs = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!data) return
    if (!seenPRs.current) {
      seenPRs.current = new Set(data.prs.keys())
      return
    }
    for (const [setId, types] of data.prs) {
      if (seenPRs.current.has(setId)) continue
      seenPRs.current.add(setId)
      const item = data.items.find((i) => i.sets.some((s) => s.id === setId))
      setToast({ title: `New PR · ${PR_LABELS[types[0]]}`, detail: item?.exercise?.name ?? '' })
      navigator.vibrate?.([30, 60, 30])
    }
  }, [data])
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(id)
  }, [toast])

  if (session === null) return <Navigate to="/" replace />
  if (!session || !data) return <Page />

  const { items } = data
  const allSets = items.flatMap((i) => i.sets)
  const active = items.find((i) => i.sessionExercise.id === activeId) ?? items.find(incomplete) ?? items.at(-1)
  const activeIndex = active ? items.indexOf(active) : -1
  const nextItem = [...items.slice(activeIndex + 1), ...items.slice(0, activeIndex)].find(incomplete)

  const finish = async () => {
    navigate(`/workouts/${session.id}`, { replace: true, state: { justFinished: true } })
    await finishWorkout(session.id)
  }
  const discard = async () => {
    navigate('/', { replace: true })
    await discardWorkout(session.id)
  }

  return (
    <Page
      title={session.name}
      leading={
        <Link to="/" className="nav-back glass" aria-label="Minimise workout">
          <Icon name="chevronDown" size={22} />
        </Link>
      }
      trailing={
        <button className="btn btn-filled btn-nav" onClick={() => setFinishing(true)}>
          Finish
        </button>
      }
    >
      <dl className="stat-strip">
        <div>
          <dt>Duration</dt>
          <dd className="num">{formatDuration(now - session.startedAt)}</dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd className="num">
            {Math.round(toDisplay(sessionVolumeKg(allSets), settings.units)).toLocaleString()}
            <small>{settings.units}</small>
          </dd>
        </div>
        <div>
          <dt>Sets</dt>
          <dd className="num">{allSets.length}</dd>
        </div>
      </dl>

      {items.length === 0 ? (
        <section className="empty">
          <Icon name="dumbbell" size={52} />
          <h2>Add your first exercise</h2>
          <p>Each set is pre-filled from last time, so logging is a single tap.</p>
        </section>
      ) : (
        <div className="ex-list">
          {items.map((item) => (
            <ExerciseCard
              key={item.sessionExercise.id}
              item={item}
              prs={data.prs}
              units={settings.units}
              showRpe={settings.showRpe}
              defaultRestSec={settings.defaultRestSec}
              active={item === active}
              onActivate={() => setActiveId(item.sessionExercise.id)}
              next={
                nextItem && {
                  name: nextItem.exercise?.name ?? 'next exercise',
                  go: () => setActiveId(nextItem.sessionExercise.id),
                }
              }
            />
          ))}
        </div>
      )}

      <Link to="/workout/add" className={`btn ${items.length === 0 ? 'btn-filled' : 'btn-gray'}`}>
        <Icon name="plus" size={20} />
        Add exercise
      </Link>

      {toast && (
        <div className="toast glass" role="status">
          <span className="toast-icon">
            <Icon name="star" size={18} />
          </span>
          <span className="toast-body">
            <span className="toast-title">{toast.title}</span>
            <span className="toast-detail">{toast.detail}</span>
          </span>
        </div>
      )}
      <RestPill />
      <ActionSheet
        open={finishing}
        title={allSets.length > 0 ? 'Finish workout?' : 'No sets logged yet'}
        message={
          allSets.length > 0
            ? `${allSets.length} ${allSets.length === 1 ? 'set' : 'sets'} in ${formatDuration(now - session.startedAt)}`
            : 'Discard this workout, or keep going.'
        }
        actions={[
          ...(allSets.length > 0 ? [{ label: 'Finish workout', onSelect: finish }] : []),
          { label: 'Discard workout', destructive: true, onSelect: discard },
        ]}
        onClose={() => setFinishing(false)}
      />
    </Page>
  )
}
