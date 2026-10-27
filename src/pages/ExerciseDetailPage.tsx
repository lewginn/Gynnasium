import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Trophy } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LineChart from '../components/charts/LineChart'
import { ExerciseNoteCard } from '../components/ExerciseNote'
import { exerciseHistory, exerciseTrend, loadExercise, setLoggingOverride } from '../db/repo'
import { useSettings } from '../db/settings'
import { formatRest, formatWhen } from '../lib/format'
import { EQUIPMENT_LABELS, MUSCLE_LABELS, PATTERN_LABELS } from '../lib/labels'
import { bestE1RM, countsForStats, formatAddedWeight, formatSeconds, summariseSets } from '../lib/summary'
import type { LoggingType, SetLog, Settings } from '../lib/types'
import { formatEstimate, formatWeight, toDisplay } from '../lib/units'

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

export default function ExerciseDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const exercise = useLiveQuery(() => loadExercise(id), [id])
  const history = useLiveQuery(() => exerciseHistory(id), [id])
  const trend = useLiveQuery(() => exerciseTrend(id), [id, exercise?.logging])

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
  const stats = statsFor(exercise.logging, working, settings)

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
          {[...stats, { label: 'Workouts', value: String(history?.length ?? 0) }].map((stat) => (
            <div key={stat.label} className="stat">
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      )}

      {trend && trend.length > 1 && (
        <section className="card" aria-labelledby="trend-heading">
          <h2 id="trend-heading">
            {TREND_TITLE[exercise.logging]}
            {exercise.logging === 'weight_reps' && <span className="muted"> ({settings.units})</span>}
          </h2>
          <LineChart
            title={`${exercise.name}: ${TREND_TITLE[exercise.logging].toLowerCase()} per workout`}
            series={[
              {
                label: TREND_TITLE[exercise.logging],
                points: exercise.logging === 'weight_reps' ? trend.map((p) => ({ ...p, y: toDisplay(p.y, settings.units) })) : trend,
                style: 'line',
                tone: 'primary',
              },
            ]}
            formatY={(v) => (exercise.logging === 'time' ? formatSeconds(v) : exercise.logging === 'bodyweight' ? `${v}` : `${Number(v.toFixed(1))}`)}
          />
        </section>
      )}

      <section className="card" aria-labelledby="history-heading">
        <h2 id="history-heading">History</h2>
        {history && history.length > 0 ? (
          <ul className="history-list">
            {history.map(({ session, sets }) => (
              <li key={session.id}>
                <Link to={`/history/${session.id}`} className="history-date when">
                  {formatWhen(session.startedAt)}
                </Link>
                <span>
                  {summariseSets(sets.filter((s) => s.setType !== 'warmup'), settings, exercise.logging)}
                  {sets.some((s) => s.prs?.length) && <Trophy size={14} className="pr-mark" aria-label="PR" />}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">You haven't logged this yet. Your sets, PRs and estimated 1RM will show here.</p>
        )}
      </section>

      <ExerciseNoteCard exerciseId={exercise.id} exerciseName={exercise.name} />

      <section className="card">
        <h2 id="log-as">Log as</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="log-as">
          {LOGGING_OPTIONS.map(([value, text]) => (
            <button key={value} role="radio" aria-checked={exercise.logging === value} onClick={() => setLoggingOverride(exercise.id, value)}>
              {text}
            </button>
          ))}
        </div>
        <p className="muted small">{LOGGING_HELP[exercise.logging]}</p>
      </section>

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
      {/* Last on the page: it loads late (from the web) and would otherwise push buttons down mid-tap. */}
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
    </>
  )
}

const TREND_TITLE: Record<LoggingType, string> = {
  weight_reps: 'Best est. 1RM',
  bodyweight: 'Most reps',
  time: 'Longest time',
}

const LOGGING_OPTIONS: [LoggingType, string][] = [
  ['weight_reps', 'Weight × reps'],
  ['bodyweight', 'Bodyweight'],
  ['time', 'Time'],
]

const LOGGING_HELP: Record<LoggingType, string> = {
  weight_reps: 'Log the weight and reps for each set.',
  bodyweight: 'Log reps, plus any added weight (or a minus for assistance).',
  time: 'Log how long you held or carried it, plus any weight.',
}

/** The two headline numbers for an exercise, depending on how it's logged. */
function statsFor(logging: LoggingType, sets: SetLog[], settings: Settings): { label: string; value: string }[] {
  if (sets.length === 0) return []
  const heaviest = Math.max(...sets.map((s) => s.weightKg))
  if (logging === 'time')
    return [
      { label: 'Longest', value: formatSeconds(Math.max(...sets.map((s) => s.durationSec ?? 0))) },
      { label: 'Heaviest', value: heaviest > 0 ? formatWeight(heaviest, settings.units) : '–' },
    ]
  if (logging === 'bodyweight')
    return [
      { label: 'Most reps', value: String(Math.max(...sets.map((s) => s.reps))) },
      { label: 'Most added', value: formatAddedWeight(heaviest, settings) },
    ]
  const e1rm = bestE1RM(sets)
  return [
    { label: 'Best est. 1RM', value: e1rm ? formatEstimate(e1rm, settings.units) : '–' },
    { label: 'Heaviest', value: formatWeight(heaviest, settings.units) },
  ]
}
