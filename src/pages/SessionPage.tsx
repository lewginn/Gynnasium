import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Pencil, Trophy, Watch } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { loadSession, type SessionDetail } from '../db/repo'
import { useSettings } from '../db/settings'
import { formatDuration, formatFullWhen } from '../lib/format'
import { PR_LABELS } from '../lib/prs'
import { countsForStats, formatSet, summariseSets, totalVolumeKg } from '../lib/summary'
import type { Settings } from '../lib/types'
import { formatWeight } from '../lib/units'

/** A finished workout: shown straight after "Finish", and from history. */
export default function SessionPage() {
  const { sessionId = '' } = useParams()
  const settings = useSettings()
  const detail = useLiveQuery(async () => (await loadSession(sessionId)) ?? null, [sessionId])
  const [exported, setExported] = useState(false)

  if (detail === undefined) return <p className="muted">Loading…</p>
  if (detail === null)
    return (
      <section className="card">
        <h2>Workout not found</h2>
        <Link to="/">Back to today</Link>
      </section>
    )

  const { session, exercises } = detail
  const allSets = exercises.flatMap((e) => e.sets)
  const weightedSets = exercises.filter((e) => e.exercise.logging === 'weight_reps').flatMap((e) => e.sets)
  const prSets = exercises.flatMap(({ exercise, sets }) => sets.filter((s) => s.prs?.length).map((set) => ({ exercise, set })))
  const workingSets = allSets.filter(countsForStats).length

  return (
    <>
      <header className="page-header">
        <Link to="/progress" className="back-link">
          <ChevronLeft size={18} aria-hidden /> History
        </Link>
        <h1>{session.name}</h1>
        <p className="muted when">{formatFullWhen(session.startedAt)}</p>
      </header>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{session.endedAt ? formatDuration(session.endedAt - session.startedAt) : '–'}</span>
          <span className="stat-label">Duration</span>
        </div>
        <div className="stat">
          <span className="stat-value">{workingSets}</span>
          <span className="stat-label">Sets</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatWeight(totalVolumeKg(weightedSets), settings.units).replace(/\.\d+/, '')}</span>
          <span className="stat-label">Volume</span>
        </div>
      </div>

      {prSets.length > 0 && (
        <section className="card pr-card">
          <h2>
            <Trophy size={14} aria-hidden className="pr-mark" /> {prSets.length === 1 ? 'New PR' : `${prSets.length} new PRs`}
          </h2>
          <ul className="plain-list">
            {prSets.map(({ exercise, set }) => (
              <li key={set.id}>
                <strong>{exercise.name}</strong>: {formatSet(set, settings, exercise.logging)}
                <span className="muted small block">{set.prs!.map((p) => PR_LABELS[p]).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="list">
        {exercises.map(({ se, exercise, sets }) => (
          <li key={se.id}>
            <Link to={`/exercises/${encodeURIComponent(exercise.id)}`} className="list-row">
              <span className="list-title">{exercise.name}</span>
              <span className="list-meta">{summariseSets(sets.filter((s) => s.setType !== 'warmup'), settings, exercise.logging)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Link to="/" className="btn btn-primary btn-block">
        Done
      </Link>
      <Link to={`/history/${session.id}/edit`} className="btn btn-block">
        <Pencil size={18} aria-hidden /> Edit workout
      </Link>
      {session.endedAt && workingSets > 0 && (
        <>
          <button
            className="btn btn-block"
            onClick={async () => {
              if (await exportForGarmin(detail, settings.units)) setExported(true)
            }}
          >
            <Watch size={18} aria-hidden /> Export for Garmin
          </button>
          {exported && (
            <p className="muted small export-help" role="status">
              Saved as a .fit file. To add it to Garmin Connect, go to connect.garmin.com, then Import Data, and choose the file.
            </p>
          )}
        </>
      )}
    </>
  )
}

/** Builds the .fit file and hands it to the share sheet (iPhone: Save to Files), or downloads it. False if cancelled. */
async function exportForGarmin(detail: SessionDetail, units: Settings['units']): Promise<boolean> {
  const { encodeWorkout, fitFileName } = await import('../lib/fit') // the FIT SDK loads only when needed
  const bytes = encodeWorkout(
    detail.session,
    detail.exercises.map(({ exercise, sets }) => ({ exercise, sets })),
    units,
  )
  const file = new File([bytes], fitFileName(detail.session), { type: 'application/vnd.ant.fit' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: detail.session.name })
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false
      // Sharing failed for another reason: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}
