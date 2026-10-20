import { useEffect } from 'react'
import { isNative, keepAwake } from '../native'

/** Keeps the screen on while `active` (e.g. during a workout). Re-acquired when the tab becomes visible again. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !isNative) return
    // The iOS app turns off auto-lock directly.
    void keepAwake(true).catch(() => {})
    return () => void keepAwake(false).catch(() => {})
  }, [active])

  useEffect(() => {
    if (!active || isNative || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) void lock.release()
      } catch {
        // Denied (battery saver, etc.): not critical.
      }
    }
    const onVisible = () => document.visibilityState === 'visible' && void acquire()
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}
