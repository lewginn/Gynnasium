import { useRef, useState } from 'react'
import Icon from './Icon'

type Props = {
  label: string
  unit: string
  value: number
  step: number
  min?: number
  onChange: (value: number) => void
}

const HOLD_DELAY = 400
const HOLD_INTERVAL = 80

/**
 * Big −/+ stepper around a number you can also type into.
 * Holding a button repeats, so getting from 60 to 100kg doesn't take 16 taps.
 */
export default function Stepper({ label, unit, value, step, min = 0, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const latest = useRef(value)
  latest.current = value
  const timer = useRef<number | undefined>(undefined)
  const held = useRef(false)

  const nudge = (direction: 1 | -1) => {
    const next = Math.max(min, Math.round((latest.current + direction * step) * 100) / 100)
    latest.current = next
    onChange(next)
  }

  const stopHold = () => {
    window.clearTimeout(timer.current)
    window.clearInterval(timer.current)
  }

  const button = (direction: 1 | -1) => (
    <button
      type="button"
      className="stepper-button"
      aria-label={`${direction === 1 ? 'Increase' : 'Decrease'} ${label}`}
      onPointerDown={() => {
        held.current = false
        stopHold()
        timer.current = window.setTimeout(() => {
          held.current = true
          timer.current = window.setInterval(() => nudge(direction), HOLD_INTERVAL)
        }, HOLD_DELAY)
      }}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        // A hold already stepped; don't add one more on release.
        if (held.current) held.current = false
        else nudge(direction)
      }}
    >
      <Icon name={direction === 1 ? 'plus' : 'minus'} size={22} />
    </button>
  )

  return (
    <div className="stepper">
      {button(-1)}
      <label className="stepper-value">
        <input
          className="num"
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          aria-label={label}
          value={draft ?? String(value)}
          onFocus={(e) => {
            setDraft(String(value))
            e.currentTarget.select()
          }}
          onChange={(e) => {
            setDraft(e.target.value)
            const parsed = Number(e.target.value.replace(',', '.'))
            if (e.target.value !== '' && Number.isFinite(parsed)) onChange(Math.max(min, parsed))
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className="stepper-unit">{unit}</span>
      </label>
      {button(1)}
    </div>
  )
}
