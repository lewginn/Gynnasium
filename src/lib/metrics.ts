// Pure helpers for body metrics and progress charts.

export interface Point {
  /** Epoch ms. */
  x: number
  y: number
}

const DAY = 86_400_000

/** Local-date string "YYYY-MM-DD" for a timestamp (body metrics are stored per day). */
export function toDateKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Midday local time on a "YYYY-MM-DD" date, so it plots in the middle of its day. */
export function fromDateKey(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

/** One value per day (the mean if logged more than once), oldest first. */
export function dailyValues(entries: { date: string; value: number }[]): Point[] {
  const byDay = new Map<string, number[]>()
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e.value])
  return [...byDay.entries()]
    .map(([date, values]) => ({ x: fromDateKey(date), y: values.reduce((a, b) => a + b, 0) / values.length }))
    .sort((a, b) => a.x - b.x)
}

/**
 * Trailing moving average over `windowDays` calendar days (not N entries), so gaps in logging don't
 * stretch the window. Daily bodyweight swings by 1–2kg; the 7-day average shows the real trend.
 */
export function movingAverage(daily: Point[], windowDays = 7): Point[] {
  return daily.map((p) => {
    const inWindow = daily.filter((q) => q.x <= p.x && q.x > p.x - windowDays * DAY)
    return { x: p.x, y: inWindow.reduce((sum, q) => sum + q.y, 0) / inWindow.length }
  })
}

/** Monday 00:00 local time of the week containing `ts`. */
export function weekStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/** Counts per week for the last `weeks` weeks (including this one), oldest first; empty weeks are 0. */
export function weeklyCounts(timestamps: number[], weeks: number, now = Date.now()): Point[] {
  const current = weekStart(now)
  const starts = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(current)
    d.setDate(d.getDate() - 7 * (weeks - 1 - i))
    return d.getTime()
  })
  const counts = new Map(starts.map((s) => [s, 0]))
  for (const ts of timestamps) {
    const w = weekStart(ts)
    if (counts.has(w)) counts.set(w, counts.get(w)! + 1)
  }
  return starts.map((x) => ({ x, y: counts.get(x)! }))
}

/** 3–5 round tick values covering [min, max], e.g. 78.4–83.1 → 78, 80, 82, 84. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1
    min -= pad
    max += pad
  }
  const rough = (max - min) / target
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!
  const ticks: number[] = []
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)))
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toFixed(10)))
  return ticks
}

/** Percentage change from the first to the last point, or null with fewer than 2 points. */
export function change(points: Point[]): number | null {
  if (points.length < 2 || points[0].y === 0) return null
  return ((points[points.length - 1].y - points[0].y) / Math.abs(points[0].y)) * 100
}
