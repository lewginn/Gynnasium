import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  onChange: (value: number) => unknown
  step: number
  min?: number
  max?: number
  label: string
  /** Shown after the number, e.g. "kg". */
  unit?: string
  decimals?: boolean
  disabled?: boolean
}

/** − value + control. Tap the number to type an exact value with the numeric keyboard. */
export default function Stepper({ value, onChange, step, min = 0, max = 9999, label, unit, decimals, disabled }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  // The value we've asked to save but haven't seen come back yet. Quick repeated taps build on it, so
  // three fast taps of + always add three steps, rather than each starting from the last saved value.
  // The ref is the source of truth for taps (it updates before React re-renders); the state drives the display.
  const [pending, setPending] = useState<number | null>(null)
  const pendingRef = useRef<number | null>(null)
  const current = pending ?? value

  const clearPending = () => {
    pendingRef.current = null
    setPending(null)
  }
  useEffect(() => {
    if (pending !== null && pendingRef.current === pending && Math.abs(value - pending) < 1e-6) clearPending()
  }, [value, pending])
  useEffect(() => {
    // Fallback if the saved value comes back different (e.g. rounded): show what's actually stored.
    if (pending === null) return
    const t = setTimeout(clearPending, 1500)
    return () => clearTimeout(t)
  }, [pending])

  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const set = (v: number) => {
    const next = clamp(Number(v.toFixed(2)))
    pendingRef.current = next
    setPending(next)
    onChange(next)
  }
  const bump = (delta: number) => set((pendingRef.current ?? value) + delta)
  const display = Number(current.toFixed(2)).toString()

  const commit = () => {
    if (draft === null) return
    const parsed = parseFloat(draft.replace(',', '.'))
    if (!Number.isNaN(parsed)) set(decimals ? parsed : Math.round(parsed))
    setDraft(null)
  }

  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper-btn"
        aria-label={`Decrease ${label}`}
        disabled={disabled || current <= min}
        onClick={() => bump(-step)}
      >
        <Minus size={18} />
      </button>
      <label className="stepper-value">
        <input
          aria-label={label}
          inputMode={decimals ? 'decimal' : 'numeric'}
          enterKeyHint="done"
          disabled={disabled}
          value={draft ?? display}
          onFocus={(e) => {
            setDraft(display)
            e.target.select()
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {unit && <span className="stepper-unit">{unit}</span>}
      </label>
      <button
        type="button"
        className="stepper-btn"
        aria-label={`Increase ${label}`}
        disabled={disabled || current >= max}
        onClick={() => bump(step)}
      >
        <Plus size={18} />
      </button>
    </div>
  )
}
