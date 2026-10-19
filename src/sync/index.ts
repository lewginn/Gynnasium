import { useSyncExternalStore } from 'react'

// Account & sync controller. Signing in is required: everything on the phone belongs to the signed-in account.
// The Supabase library is loaded lazily so it never slows down opening the app.

export interface Account {
  id: string
  email: string
}

export interface SyncState {
  /** False when this build has no Supabase settings (local dev, unit tests): the app runs without an account. */
  configured: boolean
  /**
   * Who this phone is signed in as. Remembered on the device, so the app opens straight away and offline,
   * even when the login can't be refreshed without signal. Cleared only by signing out (or a revoked login).
   */
  account: Account | null
  /** A login link is being processed (the app was opened from the email). */
  signingIn: boolean
  /** A login link failed (expired or already used). */
  linkError: string | null
  status: 'idle' | 'syncing' | 'offline' | 'error'
  lastSyncedAt: number | null
  error: string | null
}

const ACCOUNT_KEY = 'gynnasium.account'
const LAST_SYNC_KEY = 'gynnasium.lastSyncedAt'
const configured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: still works for this session.
  }
}

/** The login link lands on the app with tokens (or an error) in the URL hash. */
function linkInUrl(): { tokens: boolean; error: string | null } {
  if (typeof location === 'undefined') return { tokens: false, error: null }
  const hash = new URLSearchParams(location.hash.slice(1))
  const error = hash.get('error_description')
  return { tokens: hash.has('access_token'), error: error ? error.replace(/\+/g, ' ') : null }
}

const link = linkInUrl()
let state: SyncState = {
  configured,
  account: configured ? read<Account>(ACCOUNT_KEY) : null,
  signingIn: configured && link.tokens,
  linkError: link.error,
  status: 'idle',
  lastSyncedAt: read<number>(LAST_SYNC_KEY),
  error: null,
}
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
/** The live login (needed to talk to Supabase). Can be missing offline even while `account` is set. */
let sessionUserId: string | null = null
let running: Promise<void> | null = null
let started = false

/** Call once at startup. Picks up a login link in the URL, restores the session, and schedules syncs. */
export async function startSync() {
  if (!configured || started) return
  started = true
  const { supabase } = await load()
  if (!supabase) return

  supabase.auth.onAuthStateChange((event, session) => {
    // Supabase advises against awaiting its own calls inside this callback; defer the work.
    setTimeout(() => void onAuth(event, session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null), 0)
  })

  const kick = () => document.visibilityState === 'visible' && void syncNow()
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', kick)
  setInterval(kick, 60_000)
}

async function onAuth(event: string, user: Account | null) {
  if (user) {
    sessionUserId = user.id
    // Make the phone's data this account's before showing it: adopt, keep, or clear another account's.
    const { claimDevice } = await import('./account')
    await claimDevice(user.id)
    write(ACCOUNT_KEY, user)
    set({ account: user, signingIn: false, linkError: null })
    void syncNow()
  } else {
    sessionUserId = null
    // A real sign-out (button, or the login was revoked). Losing signal never gets here.
    if (event === 'SIGNED_OUT') {
      write(ACCOUNT_KEY, null)
      set({ account: null, status: 'idle' })
    }
    set({ signingIn: false })
  }
}

/** Syncs now (or joins a sync already running). Never throws: failures show in the sync status. */
export function syncNow(): Promise<void> {
  if (!configured || !state.account) return Promise.resolve()
  if (running) return running
  if (!navigator.onLine || !sessionUserId) {
    set({ status: 'offline' })
    return Promise.resolve()
  }
  const userId = sessionUserId
  running = (async () => {
    set({ status: 'syncing', error: null })
    try {
      const [{ supabase, SupabaseRemote }, { syncOnce }] = await Promise.all([load(), import('./engine')])
      await syncOnce(new SupabaseRemote(supabase!, userId), userId)
      const now = Date.now()
      write(LAST_SYNC_KEY, now)
      set({ status: 'idle', lastSyncedAt: now })
    } catch (e) {
      set({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) })
    } finally {
      running = null
    }
  })()
  return running
}

const offline = "You're offline. Connect to the internet to sign in."

/** Emails a one-tap login link that opens back in this app. */
export async function sendLoginLink(email: string): Promise<string | null> {
  if (!navigator.onLine) return offline
  const { supabase } = await load()
  if (!supabase) return 'Sign-in isn’t set up on this version of the app.'
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
  return error ? authMessage(error.message) : null
}

/** Supabase's messages, in the app's words. */
function authMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link we sent you.'
  if (/already registered/i.test(message)) return 'There’s already an account with this email. Sign in instead.'
  if (/rate limit/i.test(message)) return 'Too many emails sent for now. Try again in an hour, or sign in with your password.'
  return message
}

/** Signs in with email and password. Returns an error to show, or null (the auth listener takes it from there). */
export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  if (!navigator.onLine) return offline
  const { supabase } = await load()
  if (!supabase) return 'Sign-in isn’t set up on this version of the app.'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? authMessage(error.message) : null
}

/** Creates an account. If the project asks new accounts to confirm their email, `confirm` is true and nobody is signed in yet. */
export async function createAccount(email: string, password: string): Promise<{ error: string | null; confirm: boolean }> {
  if (!navigator.onLine) return { error: offline, confirm: false }
  const { supabase } = await load()
  if (!supabase) return { error: 'Sign-in isn’t set up on this version of the app.', confirm: false }
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
  if (error) return { error: authMessage(error.message), confirm: false }
  // An existing, confirmed email comes back with no identities (Supabase doesn't reveal that the account exists).
  if (data.user && data.user.identities?.length === 0) return { error: authMessage('already registered'), confirm: false }
  return { error: null, confirm: !data.session }
}

/** Sets or changes the signed-in account's password, so you can sign in without an email. */
export async function setPassword(password: string): Promise<string | null> {
  if (!navigator.onLine) return "You're offline. Connect to the internet to change your password."
  const { supabase } = await load()
  if (!supabase) return 'Sign-in isn’t set up on this version of the app.'
  const { error } = await supabase.auth.updateUser({ password })
  if (!error) return null
  if (/session/i.test(error.message)) return 'Your login has expired. Sign out and back in, then try again.'
  return authMessage(error.message)
}

/** Signs out and returns to the login screen. Data stays on the phone for when you sign back in. */
export async function signOut() {
  await syncNow() // back up anything outstanding first, if we can
  const { supabase } = await load()
  // Local scope: works offline too, and doesn't sign out other devices.
  await supabase?.auth.signOut({ scope: 'local' })
  sessionUserId = null
  write(ACCOUNT_KEY, null)
  set({ account: null, status: 'idle' })
}
