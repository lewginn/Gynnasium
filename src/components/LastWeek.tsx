import { ChevronRight, MessagesSquare, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSettings } from '../db/settings'
import { MUSCLE_LABELS } from '../lib/labels'
import { PR_LABELS } from '../lib/prs'
import { LOW_MUSCLE_SETS, STALL_WORKOUTS, type WeeklyReview } from '../lib/review'
import { shortDate } from '../lib/schedule'
import { formatSet } from '../lib/summary'

const exerciseLink = (id: string) => `/exercises/${encodeURIComponent(id)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Last week's review on Progress: workouts and sets against the plan, PRs, stalled lifts and muscles
 * the plan trains that got few sets. "Ask Claude" (only with the coach and an active plan) opens the
 * coach with a first message to send; nothing goes to Claude until you tap Send.
 */
export default function LastWeek({ review, coachPlanId }: { review: WeeklyReview; coachPlanId: string | null }) {
  const settings = useSettings()
  const { workouts, planSets, prs, stalled, lowMuscles } = review
  const sets = planSets ?? { done: review.totalSets, planned: null }
  // Muscles missed altogether share one row, so a skipped day doesn't make a long list of zeros.
  const untrained = lowMuscles.filter((m) => m.sets === 0).map((m) => MUSCLE_LABELS[m.muscle])
  return (
    <section id="last-week" aria-labelledby="review-heading">
      <div className="card">
        <h2 id="review-heading">Last week</h2>
        <p className="muted small">
          {shortDate(review.from)} – {shortDate(review.to)}
        </p>
        <dl className="week-stats">
          <div>
            <dt>Workouts</dt>
            <dd>
              {workouts.done}
              {workouts.planned !== null && <small> / {workouts.planned}</small>}
            </dd>
          </div>
          <div>
            <dt>Working sets</dt>
            <dd>
              {sets.done}
              {sets.planned !== null && <small> / {sets.planned}</small>}
            </dd>
          </div>
          <div>
            <dt>PRs</dt>
            <dd>{prs.length}</dd>
          </div>
        </dl>
      </div>

      {prs.length > 0 && (
        <>
          <h3 className="section-label">PRs</h3>
          <ul className="list" aria-label="Last week’s PRs">
            {prs.map(({ exercise, set, kinds }) => (
              <li key={exercise.id}>
                <Link to={exerciseLink(exercise.id)} className="list-row list-row-split">
                  <Trophy size={14} aria-hidden className="pr-mark" />
                  <span className="grow">
                    <span className="list-title">{exercise.name}</span>
                    <span className="list-meta">{kinds.map((k) => PR_LABELS[k]).join(' · ')}</span>
                  </span>
                  <span className="pr-value">{formatSet(set, settings, exercise.logging)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {stalled.length > 0 && (
        <>
          <h3 className="section-label">Stalled</h3>
          <ul className="list" aria-label="Stalled lifts">
            {stalled.map(({ exercise, best, note }) => (
              <li key={exercise.id}>
                <Link to={exerciseLink(exercise.id)} className="list-row list-row-split">
                  <span>
                    <span className="list-title">{exercise.name}</span>
                    <span className="list-meta">
                      No better than {formatSet(best, settings, exercise.logging)} in {STALL_WORKOUTS} workouts
                    </span>
                    {note && <span className="list-meta">{note}</span>}
                  </span>
                  <ChevronRight size={20} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {lowMuscles.length > 0 && (
        <>
          <h3 className="section-label">Under {LOW_MUSCLE_SETS} sets</h3>
          <ul className="list" aria-label={`Muscles under ${LOW_MUSCLE_SETS} sets`}>
            {lowMuscles
              .filter((m) => m.sets > 0)
              .map(({ muscle, sets }) => (
                <li key={muscle} className="list-row list-row-split">
                  <span className="list-title">{MUSCLE_LABELS[muscle]}</span>
                  <span className="list-meta">{plural(sets, 'set', 'sets')}</span>
                </li>
              ))}
            {untrained.length > 0 && (
              <li className="list-row">
                <span className="list-title">No sets</span>
                <span className="list-meta">{untrained.join(', ')}</span>
              </li>
            )}
          </ul>
        </>
      )}

      {coachPlanId && (
        <Link to={`/plans/${coachPlanId}/coach?from=review`} className="btn btn-block">
          <MessagesSquare size={20} aria-hidden /> Ask Claude
        </Link>
      )}
    </section>
  )
}
