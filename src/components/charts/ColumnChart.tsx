import { useId, useState } from 'react'
import type { Point } from '../../lib/metrics'
import { niceTicks } from '../../lib/metrics'
import { useElementWidth } from './useElementWidth'

interface Props {
  title: string
  points: Point[]
  formatX: (x: number) => string
  formatY: (y: number) => string
  height?: number
}

const PAD = { top: 18, right: 8, bottom: 24, left: 32 }

/** Single-series columns: ≤24px wide, 4px rounded tops, square at the baseline; tap a column for its value. */
export default function ColumnChart({ title, points, formatX, formatY, height = 160 }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>(340)
  const [active, setActive] = useState<number | null>(null)
  const id = useId()
  if (points.length === 0) return null

  const ticks = niceTicks(0, Math.max(1, ...points.map((p) => p.y)), 3)
  const yMax = ticks[ticks.length - 1]
  const innerW = width - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const slot = innerW / points.length
  const barW = Math.min(24, slot - 4)
  const sy = (y: number) => PAD.top + innerH - (y / yMax) * innerH
  const cx = (i: number) => PAD.left + slot * i + slot / 2
  const lastIndex = points.length - 1

  /** Rounded top corners (4px), square base. */
  const bar = (i: number, y: number) => {
    const x = cx(i) - barW / 2
    const top = sy(y)
    const base = sy(0)
    const r = Math.min(4, barW / 2, base - top)
    if (base - top < 0.5) return ''
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`
  }

  return (
    <figure className="chart" aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="sr-only">
        {title}
      </figcaption>
      <div ref={ref} className="chart-frame">
        <svg width={width} height={height} role="img" aria-label={`${title}. This week ${formatY(points[lastIndex].y)}.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={PAD.left} x2={PAD.left + innerW} y1={sy(t)} y2={sy(t)} />
              <text className="chart-axis" x={PAD.left - 6} y={sy(t)} dy="0.32em" textAnchor="end">
                {formatY(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => (
            <g key={p.x}>
              <path className={`chart-bar ${active === i ? 'active' : ''}`} d={bar(i, p.y)} />
              {/* Hit target: the whole column slot, not just the painted bar. */}
              <rect
                className="chart-hit"
                x={cx(i) - slot / 2}
                y={PAD.top}
                width={slot}
                height={innerH}
                tabIndex={0}
                aria-label={`${formatX(p.x)}: ${formatY(p.y)}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
              />
            </g>
          ))}
          {/* Only the latest column is labelled; the rest are a tap away. */}
          <text className="chart-end-label" x={cx(lastIndex)} y={sy(points[lastIndex].y) - 6} textAnchor="middle">
            {formatY(points[lastIndex].y)}
          </text>
          <text className="chart-axis" x={cx(0)} y={height - 6} textAnchor="start">
            {formatX(points[0].x)}
          </text>
          <text className="chart-axis" x={cx(lastIndex)} y={height - 6} textAnchor="end">
            This week
          </text>
        </svg>
        {active !== null && (
          <div className="chart-tooltip" role="status" style={{ left: Math.min(Math.max(cx(active), 70), width - 70) }}>
            <span className="chart-tooltip-date">Week of {formatX(points[active].x)}</span>
            <span className="chart-tooltip-row">
              <strong>{formatY(points[active].y)}</strong>
            </span>
          </div>
        )}
      </div>
    </figure>
  )
}
