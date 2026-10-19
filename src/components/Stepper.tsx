import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'

interface Props {
  value: number
  onChange: (value: number) => void
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
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const display = Number(value.toFixed(2)).toString()

  const commit = () => {
    if (draft === null) return
    const parsed = parseFloat(draft.replace(',', '.'))
    if (!Number.isNaN(parsed)) onChange(clamp(decimals ? parsed : Math.round(parsed)))
    setDraft(null)
  }

  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper-btn"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(Number((value - step).toFixed(2))))}
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
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(Number((value + step).toFixed(2))))}
      >
        <Plus size={18} />
      </button>
    </div>
  )
}
