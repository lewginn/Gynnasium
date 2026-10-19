import { adjustRest, clearRest } from '../../db/workout'
import { useRest } from '../../hooks/useRest'
import { formatCountdown } from '../../lib/workout'

const RING = 2 * Math.PI * 15

/** Floating rest timer pill, like an iOS Live Activity. */
export default function RestPill() {
  const { timer, remainingMs } = useRest()
  if (!timer) return null
  const done = remainingMs <= 0
  const progress = done ? 1 : 1 - remainingMs / timer.durationMs

  return (
    <div className={`rest-pill glass${done ? ' done' : ''}`} role="timer" aria-label="Rest timer">
      <svg className="rest-ring" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" />
        <circle cx="18" cy="18" r="15" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} />
      </svg>
      <div className="rest-text">
        <span className="rest-label">{done ? 'Rest over' : 'Rest'}</span>
        <span className="rest-time num">{done ? 'Go' : formatCountdown(remainingMs)}</span>
      </div>
      {!done && (
        <>
          <button className="rest-button num" aria-label="15 seconds less" onClick={() => adjustRest(-15)}>
            −15
          </button>
          <button className="rest-button num" aria-label="15 seconds more" onClick={() => adjustRest(15)}>
            +15
          </button>
        </>
      )}
      <button className="rest-button rest-skip" onClick={() => clearRest()}>
        {done ? 'Dismiss' : 'Skip'}
      </button>
    </div>
  )
}
