import { CloudCheck, CloudOff, KeyRound, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import Sheet from './Sheet'
import { useConfirm } from '../state/confirm'
import { useNow } from '../state/restTimer'
import { setPassword, signOut, syncNow, useSync } from '../sync'

/** Who you're signed in as, backup status, and sign out. (Signing in itself is the LoginScreen.) */
export default function AccountCard() {
  const sync = useSync()

  if (!sync.configured)
    return (
      <section className="card" aria-labelledby="account-heading">
        <h2 id="account-heading">Account & backup</h2>
        <p className="muted small">Accounts aren't set up on this version of the app. Everything is saved on this phone.</p>
      </section>
    )

  return (
    <section className="card" aria-labelledby="account-heading">
      <h2 id="account-heading">Account & backup</h2>
      <SignedIn />
    </section>
  )
}

function SignedIn() {
  const sync = useSync()
  const now = useNow(30_000)
  const confirm = useConfirm()
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)

  async function onSignOut() {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'Anything not backed up yet stays on this phone for when you sign back in.',
      action: 'Sign out',
    })
    if (ok) await signOut()
  }

  return (
    <div className="stack-sm">
      <p className="muted small">
        Signed in as <strong>{sync.account!.email}</strong>
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
        <button className="btn btn-sm btn-danger-text" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <button className="btn btn-sm btn-block" onClick={() => setChangingPassword(true)}>
        <KeyRound size={16} aria-hidden /> Set a password
      </button>
      {passwordSaved && (
        <p className="muted small" role="status">
          Password saved. You can sign in with your email and password.
        </p>
      )}
      {changingPassword && (
        <PasswordSheet
          onClose={() => setChangingPassword(false)}
          onSaved={() => {
            setChangingPassword(false)
            setPasswordSaved(true)
          }}
        />
      )}
    </div>
  )
}

const MIN_PASSWORD = 8

/** Lets someone who signed in by email link sign in with a password next time, without waiting for an email. */
function PasswordSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const sync = useSync()
  const [password, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Sheet title="Set a password" onClose={onClose}>
      <form
        className="stack-sm"
        onSubmit={async (e) => {
          e.preventDefault()
          setSaving(true)
          const err = await setPassword(password)
          setSaving(false)
          if (err) setError(err)
          else onSaved()
        }}
      >
        {/* Lets the browser's password manager save it against the right account. */}
        <input type="email" autoComplete="username" value={sync.account?.email ?? ''} readOnly hidden />
        <label className="field">
          <span>New password</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <p className="muted small">At least {MIN_PASSWORD} characters. Then you can sign in with {sync.account?.email} and this password.</p>
        {error && (
          <p className="warning small" role="alert">
            <TriangleAlert size={16} aria-hidden /> {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={saving || password.length < MIN_PASSWORD}>
          {saving ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </Sheet>
  )
}

function ago(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}
