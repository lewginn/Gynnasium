import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Dumbbell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getActiveSession } from '../db/repo'
import { formatClock } from '../lib/format'
import { useNow, useRestTimer } from '../state/restTimer'

/** The workout in progress, docked above the tab bar (iOS 26 tab bar accessory), so it's one tap away from anywhere. */
export default function WorkoutBar() {
  const session = useLiveQuery(async () => (await getActiveSession()) ?? null)
  const now = useNow(session ? 1000 : null)
  const rest = useRestTimer()
  if (!session) return null

  return (
    <Link to="/workout" className="workout-bar glass" aria-label={`Resume ${session.name}`}>
      <span className="workout-bar-icon">
        <Dumbbell size={20} aria-hidden />
      </span>
      <span className="workout-bar-text">
        <span className="workout-bar-title">{session.name}</span>
        <span className="workout-bar-meta">
          {formatClock((now - session.startedAt) / 1000)}
          {rest.running && ` · Rest ${formatClock(Math.ceil(rest.remainingSec))}`}
        </span>
      </span>
      <ChevronRight size={18} aria-hidden />
    </Link>
  )
}
