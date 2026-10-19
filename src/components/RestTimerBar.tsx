import { SkipForward, Timer } from 'lucide-react'
import { useEffect } from 'react'
import { formatClock } from '../lib/format'
import { restTimer, useRestTimer } from '../state/restTimer'

export default function RestTimerBar() {
  const t = useRestTimer()

  // "Rest over" stays up a few seconds, then clears itself.
  useEffect(() => {
    if (!t.finishedAt) return
    const id = setTimeout(() => restTimer.dismiss(), 4000)
    return () => clearTimeout(id)
  }, [t.finishedAt])

  if (!t.running && !t.finishedAt) return null

  if (!t.running)
    return (
      <div className="rest-bar rest-over" role="status">
        <Timer size={22} aria-hidden />
        <strong>Rest over</strong>
        <button className="btn btn-sm" onClick={() => restTimer.dismiss()}>
          OK
        </button>
      </div>
    )

  const progress = t.durationSec > 0 ? 1 - t.remainingSec / t.durationSec : 1
  return (
    <div className="rest-bar" role="timer" aria-label="Rest timer">
      <div className="rest-progress" style={{ transform: `scaleX(${progress})` }} />
      <div className="rest-info">
        <span className="rest-label">Rest · {t.label}</span>
        <span className="rest-time" aria-live="off">
          {formatClock(Math.ceil(t.remainingSec))}
        </span>
      </div>
      <div className="rest-actions">
        <button className="btn btn-sm" onClick={() => restTimer.adjust(-15)} aria-label="15 seconds less">
          −15
        </button>
        <button className="btn btn-sm" onClick={() => restTimer.adjust(15)} aria-label="15 seconds more">
          +15
        </button>
        <button className="btn btn-sm" onClick={() => restTimer.skip()} aria-label="Skip rest">
          <SkipForward size={18} aria-hidden />
        </button>
      </div>
    </div>
  )
}
