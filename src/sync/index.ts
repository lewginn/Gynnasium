import { useSyncExternalStore } from 'react'

// Sync controller: signs in, and keeps this phone and Supabase in step in the background.
// The Supabase library is loaded lazily so it never slows down opening the app.

export interface SyncState {
  /** False when this build has no Supabase settings: the app is local-only. */
  configured: boolean
  ready: boolean
  user: { id: string; email: string } | null
  status: 'idle' | 'syncing' | 'offline' | 'error'
  lastSyncedAt: number | null
  error: string | null
}

const LAST_SYNC_KEY = 'gynnasium.lastSyncedAt'
const configured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

function storedLastSync(): number | null {
  try {
    return Number(localStorage.getItem(LAST_SYNC_KEY)) || null
  } catch {
    return null
  }
}

let state: SyncState = { configured, ready: !configured, user: null, status: 'idle', lastSyncedAt: storedLastSync(), error: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useSync(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

const load = () => import('./supabase')
let running: Promise<void> | null = null
let started = false

/** Call once at startup. Picks up a login link in the URL, restores the session, and schedules syncs. */
export async function startSync() {
  if (!configured || started) return
  started = true
  const { supabase } = await load()
  if (!supabase) return

  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null
    set({ user, ready: true })
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') void syncNow()
  })

  const kick = () => document.visibilityState === 'visible' && void syncNow()
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', kick)
  setInterval(kick, 60_000)
}

/** Syncs now (or joins a sync already running). Never throws: failures show in the sync status. */
export function syncNow(): Promise<void> {
  if (!configured || !state.user) return Promise.resolve()
  if (running) return running
  if (!navigator.onLine) {
    set({ status: 'offline' })
    return Promise.resolve()
  }
  const user = state.user
  running = (async () => {
    set({ status: 'syncing', error: null })
    try {
      const [{ supabase, SupabaseRemote }, { syncOnce }] = await Promise.all([load(), import('./engine')])
      await syncOnce(new SupabaseRemote(supabase!, user.id), user.id)
      const now = Date.now()
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(now))
      } catch {
        // ignore
      }
      set({ status: 'idle', lastSyncedAt: now })
    } catch (e) {
      set({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) })
    } finally {
      running = null
    }
  })()
  return running
}

/** Emails a one-tap login link that opens back in this app. */
export async function sendLoginLink(email: string): Promise<string | null> {
  const { supabase } = await load()
  if (!supabase) return 'Sync isn’t set up on this version of the app.'
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
  return error ? error.message : null
}

/** Signs out. Everything stays on this phone; it just stops syncing. */
export async function signOut() {
  const { supabase } = await load()
  await supabase?.auth.signOut()
  set({ user: null, status: 'idle' })
}
