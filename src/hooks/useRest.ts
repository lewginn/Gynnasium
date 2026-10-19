import { useEffect, useRef } from 'react'
import { useRestTimer, type RestTimer } from '../db/workout'
import { useNow } from './useNow'

/** Remaining time on the rest timer, ticking 4×/s while one is running. */
export function useRest(): { timer: RestTimer | null; remainingMs: number } {
  const timer = useRestTimer() ?? null
  const now = useNow(250, !!timer)
  return { timer, remainingMs: timer ? timer.endsAt - now : 0 }
}

/** Buzzes once when rest runs out. Mounted at the app root so it works on any screen. */
export function useRestAlarm(): void {
  const { timer, remainingMs } = useRest()
  const firedFor = useRef<number | null>(null)
  useEffect(() => {
    if (!timer || remainingMs > 0 || firedFor.current === timer.endsAt) return
    firedFor.current = timer.endsAt
    // Only alarm if it ran out just now, not when reopening the app long after.
    if (remainingMs > -2000) navigator.vibrate?.([200, 100, 200])
  }, [timer, remainingMs])
}
