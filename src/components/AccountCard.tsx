import { CloudCheck, CloudOff, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react'
import { useConfirm } from '../state/confirm'
import { useNow } from '../state/restTimer'
import { signOut, syncNow, useSync } from '../sync'

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
