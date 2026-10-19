import { useId, useMemo, useState } from 'react'
import type { Point } from '../../lib/metrics'
import { niceTicks } from '../../lib/metrics'
import { useElementWidth } from './useElementWidth'

export interface LineSeries {
  label: string
  points: Point[]
  /** 'line' joins points (2px); 'dots' plots them (8px markers). */
  style: 'line' | 'dots'
  /** 'primary' is the headline series; 'muted' is de-emphasised context (e.g. raw daily weigh-ins). */
  tone: 'primary' | 'muted'
}

interface Props {
  title: string
  series: LineSeries[]
  formatY: (v: number) => string
  height?: number
}

const PAD = { top: 12, right: 52, bottom: 24, left: 40 }
const shortDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * A small time-series chart: recessive grid, 2px lines, ringed end-dot with the latest value as its label,
 * crosshair + tooltip on touch/hover/keyboard, a legend for 2+ series, and a table view.
 */
export default function LineChart({ title, series, formatY, height = 180 }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>(340)
  const [active, setActive] = useState<number | null>(null)
  const tableId = useId()

  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b), [series])
  const ys = series.flatMap((s) => s.points.map((p) => p.y))
  if (xs.length === 0) return null

  const ticks = niceTicks(Math.min(...ys), Math.max(...ys))
  const [yMin, yMax] = [ticks[0], ticks[ticks.length - 1]]
  const innerW = Math.max(40, width - PAD.left - PAD.right)
  const innerH = height - PAD.top - PAD.bottom
  const [xMin, xMax] = [xs[0], xs[xs.length - 1]]
  const sx = (x: number) => PAD.left + (xMax === xMin ? innerW / 2 : ((x - xMin) / (xMax - xMin)) * innerW)
  const sy = (y: number) => PAD.top + innerH - ((y - yMin) / (yMax - yMin)) * innerH

  const primary = series.find((s) => s.tone === 'primary') ?? series[0]
  const last = primary.points[primary.points.length - 1]
  const activeX = active !== null ? xs[active] : null
  const valuesAt = (x: number) => series.map((s) => ({ s, p: s.points.find((p) => p.x === x) })).filter((v) => v.p)

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * width
    let best = 0
    xs.forEach((x, i) => Math.abs(sx(x) - px) < Math.abs(sx(xs[best]) - px) && (best = i))
    return best
  }

  return (
    <figure className="chart" aria-labelledby={`${tableId}-title`}>
      <figcaption id={`${tableId}-title`} className="sr-only">
        {title}
      </figcaption>
      {series.length > 1 && (
        <ul className="chart-legend">
          {series.map((s) => (
            <li key={s.label}>
              <span className={`key key-${s.style} tone-${s.tone}`} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="chart-frame">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${title}. Latest ${formatY(last.y)} on ${shortDate(last.x)}.`}
          tabIndex={0}
          onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerDown={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? xs.length) - 1))
            else if (e.key === 'ArrowRight') setActive((i) => Math.min(xs.length - 1, (i ?? -1) + 1))
            else if (e.key === 'Escape') setActive(null)
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={PAD.left} x2={PAD.left + innerW} y1={sy(t)} y2={sy(t)} />
              <text className="chart-axis" x={PAD.left - 6} y={sy(t)} dy="0.32em" textAnchor="end">
                {formatY(t)}
              </text>
            </g>
          ))}
          <text className="chart-axis" x={PAD.left} y={height - 6} textAnchor="start">
            {shortDate(xMin)}
          </text>
          {xMax !== xMin && (
            <text className="chart-axis" x={PAD.left + innerW} y={height - 6} textAnchor="end">
              {shortDate(xMax)}
            </text>
          )}

          {activeX !== null && <line className="chart-crosshair" x1={sx(activeX)} x2={sx(activeX)} y1={PAD.top} y2={PAD.top + innerH} />}

          {series.map((s) =>
            s.style === 'line' ? (
              <polyline
                key={s.label}
                className={`chart-line tone-${s.tone}`}
                points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
              />
            ) : (
              <g key={s.label}>
                {s.points.map((p) => (
                  <circle key={p.x} className={`chart-dot tone-${s.tone}`} cx={sx(p.x)} cy={sy(p.y)} r={4} />
                ))}
              </g>
            ),
          )}

          {/* Latest value: ringed end-dot, labelled with its value. */}
          <circle className={`chart-dot tone-${primary.tone}`} cx={sx(last.x)} cy={sy(last.y)} r={4.5} />
          <text className="chart-end-label" x={sx(last.x) + 9} y={sy(last.y)} dy="0.32em">
            {formatY(last.y)}
          </text>

          {activeX !== null &&
            valuesAt(activeX).map(({ s, p }) => (
              <circle key={s.label} className={`chart-dot active tone-${s.tone}`} cx={sx(p!.x)} cy={sy(p!.y)} r={5.5} />
            ))}
        </svg>
        {activeX !== null && (
          <div
            className="chart-tooltip"
            role="status"
            style={{ left: Math.min(Math.max(sx(activeX), 70), width - 70) }}
          >
            <span className="chart-tooltip-date">{shortDate(activeX)}</span>
            {valuesAt(activeX).map(({ s, p }) => (
              <span key={s.label} className="chart-tooltip-row">
                <span className={`key key-${s.style} tone-${s.tone}`} aria-hidden />
                <strong>{formatY(p!.y)}</strong>
                {series.length > 1 && <span className="muted">{s.label}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              {series.map((s) => (
                <th key={s.label} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...xs].reverse().map((x) => (
              <tr key={x}>
                <td>{shortDate(x)}</td>
                {series.map((s) => {
                  const p = s.points.find((q) => q.x === x)
                  return <td key={s.label}>{p ? formatY(p.y) : '–'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
