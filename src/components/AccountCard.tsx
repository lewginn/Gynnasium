import { CloudCheck, CloudOff, LoaderCircle, Mail, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useNow } from '../state/restTimer'
import { sendLoginLink, signOut, syncNow, useSync } from '../sync'

/** Login and backup status: email magic link, then automatic sync with Supabase. */
export default function AccountCard() {
  const sync = useSync()

  if (!sync.configured)
    return (
      <section className="card" aria-labelledby="account-heading">
        <h2 id="account-heading">Account & backup</h2>
        <p className="muted small">Backup isn't set up on this version of the app. Everything is saved on this phone.</p>
      </section>
    )

  return (
    <section className="card" aria-labelledby="account-heading">
      <h2 id="account-heading">Account & backup</h2>
      {!sync.ready ? <p className="muted small">Checking…</p> : sync.user ? <SignedIn /> : <SignIn />}
    </section>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (sentTo)
    return (
      <div className="stack-sm">
        <p className="account-line">
          <Mail size={18} aria-hidden /> Check your email
        </p>
        <p className="muted small">
          We sent a login link to <strong>{sentTo}</strong>. Open it on this phone and you'll be signed in. It can take a minute to arrive.
        </p>
        <button className="btn btn-sm" onClick={() => setSentTo(null)}>
          Use a different email
        </button>
      </div>
    )

  return (
    <form
      className="stack-sm"
      onSubmit={async (e) => {
        e.preventDefault()
        setSending(true)
        setError(null)
        const err = await sendLoginLink(email.trim())
        setSending(false)
        if (err) setError(err)
        else setSentTo(email.trim())
      }}
    >
      <p className="muted small">Sign in to back up your workouts and use them on other devices. No password: we email you a link.</p>
      <input
        className="input"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        aria-label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error && (
        <p className="warning small" role="alert">
          <TriangleAlert size={16} aria-hidden /> {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={sending || !email.includes('@')}>
        {sending ? 'Sending…' : 'Email me a login link'}
      </button>
    </form>
  )
}

function SignedIn() {
  const sync = useSync()
  const now = useNow(30_000)

  return (
    <div className="stack-sm">
      <p className="muted small">
        Signed in as <strong>{sync.user!.email}</strong>
      </p>
      <p className="account-line" role="status">
        {sync.status === 'syncing' ? (
          <>
            <LoaderCircle size={18} className="spin" aria-hidden /> Backing up…
          </>
        ) : sync.status === 'offline' ? (
          <>
            <CloudOff size={18} aria-hidden /> Offline: will back up when you're online
          </>
        ) : sync.status === 'error' ? (
          <>
            <TriangleAlert size={18} aria-hidden /> Backup failed: {sync.error}
          </>
        ) : (
          <>
            <CloudCheck size={18} aria-hidden /> {sync.lastSyncedAt ? `Backed up ${ago(now - sync.lastSyncedAt)}` : 'Not backed up yet'}
          </>
        )}
      </p>
      <div className="row">
        <button className="btn btn-sm grow" onClick={() => syncNow()} disabled={sync.status === 'syncing'}>
          <RefreshCw size={16} aria-hidden /> Back up now
        </button>
        <button
          className="btn btn-sm btn-danger-text"
          onClick={() => confirm('Sign out? Everything stays on this phone; it just stops backing up.') && signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function ago(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}
