import type { Point } from '../../lib/metrics'

/** A tiny trend line for list rows: no axes; the row's text carries the numbers. */
export default function Sparkline({ points, width = 72, height = 28 }: { points: Point[]; width?: number; height?: number }) {
  if (points.length < 2) return <span style={{ width }} />
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const sx = (x: number) => 3 + ((x - x0) / (x1 - x0 || 1)) * (width - 6)
  const sy = (y: number) => height - 3 - ((y - y0) / (y1 - y0 || 1)) * (height - 6)
  const last = points[points.length - 1]
  return (
    <svg className="sparkline" width={width} height={height} aria-hidden>
      <polyline className="chart-line tone-primary" points={points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
      <circle className="chart-dot tone-primary" cx={sx(last.x)} cy={sy(last.y)} r={3} />
    </svg>
  )
}
