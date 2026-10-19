import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Trophy } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db/db'
import { exerciseHistory } from '../db/repo'
import { useSettings } from '../db/settings'
import { formatDay, formatRest } from '../lib/format'
import { EQUIPMENT_LABELS, MUSCLE_LABELS, PATTERN_LABELS } from '../lib/labels'
import { bestE1RM, countsForStats, summariseSets } from '../lib/summary'
import { formatWeight } from '../lib/units'

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

export default function ExerciseDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const exercise = useLiveQuery(async () => (await db.exercises.get(id)) ?? null, [id])
  const history = useLiveQuery(() => exerciseHistory(id), [id])

  if (exercise === undefined) return <p className="muted">Loading…</p>
  if (exercise === null)
    return (
      <section className="card">
        <h2>Exercise not found</h2>
        <Link to="/exercises">Back to exercises</Link>
      </section>
    )

  const allSets = history?.flatMap((h) => h.sets) ?? []
  const working = allSets.filter(countsForStats)
  const e1rm = bestE1RM(allSets)
  const heaviest = working.length ? Math.max(...working.map((s) => s.weightKg)) : null

  return (
    <>
      <header className="page-header">
        <button className="back-link" onClick={() => (window.history.state?.idx ? navigate(-1) : navigate('/exercises'))}>
          <ChevronLeft size={18} aria-hidden /> Back
        </button>
        <h1>{exercise.name}</h1>
        <p className="muted small">
          {exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} · {EQUIPMENT_LABELS[exercise.equipment]}
        </p>
      </header>

      {working.length > 0 && (
        <div className="stat-row">
          <div className="stat">
            <span className="stat-value">{e1rm ? formatWeight(e1rm, settings.units).replace(/(\.\d)\d+/, '$1') : '–'}</span>
            <span className="stat-label">Best est. 1RM</span>
          </div>
          <div className="stat">
            <span className="stat-value">{heaviest !== null ? formatWeight(heaviest, settings.units) : '–'}</span>
            <span className="stat-label">Heaviest</span>
          </div>
          <div className="stat">
            <span className="stat-value">{history?.length ?? 0}</span>
            <span className="stat-label">Workouts</span>
          </div>
        </div>
      )}

      <section className="card" aria-labelledby="history-heading">
        <h2 id="history-heading">History</h2>
        {history && history.length > 0 ? (
          <ul className="history-list">
            {history.map(({ session, sets }) => (
              <li key={session.id}>
                <Link to={`/history/${session.id}`} className="history-date">
                  {formatDay(session.startedAt)}
                </Link>
                <span>
                  {summariseSets(sets.filter((s) => s.setType !== 'warmup'), settings)}
                  {sets.some((s) => s.prs?.length) && <Trophy size={14} className="pr-icon" aria-label="PR" />}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">You haven't logged this yet. Your sets, PRs and estimated 1RM will show here.</p>
        )}
      </section>

      {exercise.image && (
        <img
          className="exercise-image"
          src={IMAGE_BASE + exercise.image}
          alt=""
          width={320}
          height={240}
          // Hidden until it arrives, so there's no empty box while loading or when offline.
          hidden
          onLoad={(e) => (e.currentTarget.hidden = false)}
        />
      )}
      <dl className="card details">
        <dt>Primary</dt>
        <dd>{exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}</dd>
        {exercise.secondaryMuscles.length > 0 && (
          <>
            <dt>Secondary</dt>
            <dd>{exercise.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}</dd>
          </>
        )}
        <dt>Equipment</dt>
        <dd>{EQUIPMENT_LABELS[exercise.equipment]}</dd>
        <dt>Movement</dt>
        <dd>
          {PATTERN_LABELS[exercise.movementPattern]} · {exercise.mechanic}
        </dd>
        <dt>Default rest</dt>
        <dd>{formatRest(exercise.defaultRestSec)}</dd>
      </dl>
    </>
  )
}
