import { useEffect, useState, useSyncExternalStore } from 'react'
import { restOverAlert } from '../lib/feedback'
import { isNative, scheduleRestOver } from '../native'

export interface RestTimerState {
  /** Epoch ms when rest ends. Stored as an end time (not a countdown) so it stays right if the tab sleeps or reloads. */
  endAt: number | null
  durationSec: number
  label: string
  /** Set briefly after the timer runs out, to show "Rest over". */
  finishedAt: number | null
}

const STORAGE_KEY = 'gynnasium.restTimer'
const EMPTY: RestTimerState = { endAt: null, durationSec: 0, label: '', finishedAt: null }

function load(): RestTimerState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as RestTimerState | null
    // A timer that ran out while the app was closed is stale; don't alert for it.
    if (parsed?.endAt && parsed.endAt > Date.now()) return { ...parsed, finishedAt: null }
  } catch {
    // Storage unavailable (private mode etc.): timer still works for this page load.
  }
  return EMPTY
}

let state: RestTimerState = typeof localStorage === 'undefined' ? EMPTY : load()
const listeners = new Set<() => void>()
let ticker: ReturnType<typeof setInterval> | null = null

function set(next: RestTimerState) {
  // In the iOS app, a notification covers the end of rest while the app is in the background or the phone is locked.
  if (isNative && next.endAt !== state.endAt) void scheduleRestOver(next.endAt, next.label)
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
  ensureTicker()
}

// Checks for the end of rest even when no timer UI is mounted.
function ensureTicker() {
  if (state.endAt && !ticker) {
    ticker = setInterval(() => {
      if (state.endAt && Date.now() >= state.endAt) {
        restOverAlert()
        set({ ...state, endAt: null, finishedAt: Date.now() })
      }
      if (!state.endAt) {
        clearInterval(ticker!)
        ticker = null
      }
    }, 250)
  }
}
ensureTicker()

export const restTimer = {
  start(durationSec: number, label: string) {
    set({ endAt: Date.now() + durationSec * 1000, durationSec, label, finishedAt: null })
  },
  adjust(deltaSec: number) {
    if (!state.endAt) return
    const endAt = Math.max(Date.now() + 1000, state.endAt + deltaSec * 1000)
    set({ ...state, endAt, durationSec: Math.max(1, state.durationSec + deltaSec) })
  },
  skip() {
    set(EMPTY)
  },
  dismiss() {
    set(EMPTY)
  },
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRestTimer() {
  const s = useSyncExternalStore(subscribe, () => state)
  const now = useNow(s.endAt ? 250 : null)
  const remainingSec = s.endAt ? Math.max(0, (s.endAt - now) / 1000) : 0
  return { ...s, remainingSec, running: !!s.endAt }
}

/** Current time, re-rendering every `intervalMs` (or never when null). */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (intervalMs === null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
