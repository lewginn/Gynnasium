import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { addBodyMetric, bodyMetrics, deleteBodyMetric } from '../db/repo'
import { useSettings } from '../db/settings'
import { dailyValues, movingAverage, toDateKey } from '../lib/metrics'
import type { BodyMetricType, Settings } from '../lib/types'
import { roundForDisplay, toDisplay, toKg } from '../lib/units'
import LineChart from './charts/LineChart'
import Sheet from './Sheet'
import Stepper from './Stepper'

const TYPES: { type: BodyMetricType; label: string; unit: 'weight' | '%' | 'cm' }[] = [
  { type: 'bodyweight', label: 'Bodyweight', unit: 'weight' },
  { type: 'bodyfat', label: 'Body fat', unit: '%' },
  { type: 'waist', label: 'Waist', unit: 'cm' },
  { type: 'chest', label: 'Chest', unit: 'cm' },
  { type: 'arm', label: 'Arm', unit: 'cm' },
  { type: 'thigh', label: 'Thigh', unit: 'cm' },
]

const DAY = 86_400_000

function formatMetric(type: BodyMetricType, value: number, settings: Settings) {
  const unit = TYPES.find((t) => t.type === type)!.unit
  if (unit === 'weight') return `${roundForDisplay(toDisplay(value, settings.units), settings.units).toFixed(1)}${settings.units}`
  return `${Number(value.toFixed(1))}${unit}`
}

/** Bodyweight with its 7-day average, plus other measurements. */
export default function BodyCard() {
  const settings = useSettings()
  const all = useLiveQuery(() => bodyMetrics())
  const [type, setType] = useState<BodyMetricType>('bodyweight')
  const [logging, setLogging] = useState(false)

  const entries = useMemo(() => (all ?? []).filter((m) => m.type === type), [all, type])
  const daily = useMemo(() => dailyValues(entries).map((p) => ({ ...p, y: type === 'bodyweight' ? toDisplay(p.y, settings.units) : p.y })), [entries, type, settings.units])
  const average = useMemo(() => movingAverage(daily), [daily])
  const meta = TYPES.find((t) => t.type === type)!
  const fmt = (v: number) => (meta.unit === 'weight' ? `${v.toFixed(1)}` : `${Number(v.toFixed(1))}`)

  const latestAvg = average.at(-1)
  // Compare with 4 weeks ago, or with the first entry if there's at least a week but not yet a month of data.
  const monthAgo = average.filter((p) => p.x <= (latestAvg?.x ?? 0) - 28 * DAY).at(-1)
  const baseline = monthAgo ?? (latestAvg && average[0].x <= latestAvg.x - 7 * DAY ? average[0] : undefined)
  const delta = latestAvg && baseline ? latestAvg.y - baseline.y : null
  const deltaLabel = monthAgo
    ? 'vs 4 weeks ago'
    : baseline && `since ${new Date(baseline.x).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
  const unitLabel = meta.unit === 'weight' ? settings.units : meta.unit

  return (
    <section className="card" aria-labelledby="body-heading">
      <div className="title-row">
        <h2 id="body-heading">Body</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setLogging(true)}>
          <Plus size={16} aria-hidden /> Log
        </button>
      </div>
      <div className="chips" role="group" aria-label="Measurement">
        {TYPES.map((t) => (
          <button key={t.type} className="chip chip-sm" aria-pressed={type === t.type} onClick={() => setType(t.type)}>
            {t.label}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="muted small">
          No {meta.label.toLowerCase()} logged yet.{' '}
          {type === 'bodyweight' && 'Weigh yourself first thing in the morning; the 7-day average smooths out daily swings.'}
        </p>
      ) : (
        <>
          <div className="body-stats">
            <span>
              <span className="stat-value">
                {fmt(latestAvg!.y)}
                <span className="stat-unit">{unitLabel}</span>
              </span>
              <span className="stat-label">{entries.length > 1 ? '7-day average' : 'Latest'}</span>
            </span>
            {delta !== null && (
              <span>
                <span className="stat-value">
                  {delta > 0 ? '+' : delta < 0 ? '−' : ''}
                  {fmt(Math.abs(delta))}
                  <span className="stat-unit">{unitLabel}</span>
                </span>
                <span className="stat-label">{deltaLabel}</span>
              </span>
            )}
          </div>
          {daily.length > 1 && (
            <LineChart
              title={`${meta.label} over time`}
              series={[
                { label: 'Daily', points: daily, style: 'dots', tone: 'muted' },
                { label: '7-day average', points: average, style: 'line', tone: 'primary' },
              ]}
              formatY={fmt}
            />
          )}
          <details className="chart-table">
            <summary>Entries</summary>
            <ul className="entry-list">
              {entries.slice(0, 30).map((m) => (
                <li key={m.id}>
                  <span>{new Date(m.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <strong>{formatMetric(m.type, m.value, settings)}</strong>
                  <button className="icon-btn danger" aria-label={`Delete ${m.date} entry`} onClick={() => deleteBodyMetric(m.id)}>
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {logging && <LogSheet initialType={type} lastValues={all ?? []} onClose={() => setLogging(false)} />}
    </section>
  )
}

function LogSheet({
  initialType,
  lastValues,
  onClose,
}: {
  initialType: BodyMetricType
  lastValues: { type: BodyMetricType; value: number }[]
  onClose: () => void
}) {
  const settings = useSettings()
  const [type, setType] = useState(initialType)
  const meta = TYPES.find((t) => t.type === type)!
  const isWeight = meta.unit === 'weight'
  // Start from the last value logged, so it's usually a nudge of − / +.
  const last = lastValues.find((m) => m.type === type)?.value
  const defaultValue = last ?? (isWeight ? 75 : type === 'bodyfat' ? 20 : 80)
  const [value, setValue] = useState<number | null>(null)
  const shown = value ?? (isWeight ? roundForDisplay(toDisplay(defaultValue, settings.units), settings.units) : defaultValue)
  const [date, setDate] = useState(toDateKey(Date.now()))

  return (
    <Sheet title="Log measurement" onClose={onClose}>
      <div className="segmented segmented-wrap" role="radiogroup" aria-label="Measurement type">
        {TYPES.map((t) => (
          <button
            key={t.type}
            role="radio"
            aria-checked={type === t.type}
            onClick={() => {
              setType(t.type)
              setValue(null)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="stack">
        <label className="field">
          <span>
            {meta.label} ({isWeight ? settings.units : meta.unit})
          </span>
          <Stepper label={meta.label} value={shown} step={isWeight ? (settings.units === 'kg' ? 0.1 : 0.2) : 0.5} max={isWeight ? 1000 : 300} decimals onChange={setValue} />
        </label>
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" value={date} max={toDateKey(Date.now())} onChange={(e) => setDate(e.target.value || date)} />
        </label>
        <button
          className="btn btn-primary btn-block"
          onClick={async () => {
            await addBodyMetric(type, isWeight ? toKg(shown, settings.units) : shown, date)
            onClose()
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  )
}
