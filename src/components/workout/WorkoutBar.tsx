import { Link } from 'react-router-dom'
import { useActiveSession } from '../../db/workout'
import { useNow } from '../../hooks/useNow'
import { useRest } from '../../hooks/useRest'
import { formatCountdown, formatDuration } from '../../lib/workout'
import Icon from '../Icon'

/** The workout in progress, docked above the tab bar (iOS 26 tab bar accessory). */
export default function WorkoutBar() {
  const session = useActiveSession()
  const now = useNow(1000, !!session)
  const { timer, remainingMs } = useRest()
  if (!session) return null

  return (
    <Link to="/workout" className="workout-bar glass" aria-label={`Resume ${session.name}`}>
      <span className="row-icon">
        <Icon name="dumbbell" size={20} />
      </span>
      <span className="row-body">
        <span className="workout-bar-title">{session.name}</span>
        <span className="workout-bar-meta num">
          {formatDuration(now - session.startedAt)}
          {timer && (remainingMs > 0 ? ` · Rest ${formatCountdown(remainingMs)}` : ' · Rest over')}
        </span>
      </span>
      <Icon name="chevronRight" size={16} className="row-chevron" />
    </Link>
  )
}
