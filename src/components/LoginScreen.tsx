import { Mail, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { sendLoginLink, useSync } from '../sync'

/** Shown instead of the app until you sign in. Signing in is required so everything belongs to your account. */
export default function LoginScreen() {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(sync.linkError)

  if (sync.signingIn)
    return (
      <main className="content login" aria-busy="true">
        <h1>Gynnasium</h1>
        <p className="muted">Signing you in…</p>
      </main>
    )

  return (
    <main className="content login">
      <h1>Gynnasium</h1>
      <p className="muted">Track your workouts, PRs and progress. Sign in to get started: your plans, workouts and settings are saved to your account.</p>

      {sentTo ? (
        <section className="card stack-sm" aria-labelledby="sent-heading">
          <h2 id="sent-heading" className="account-line">
            <Mail size={20} aria-hidden /> Check your email
          </h2>
          <p className="muted small">
            We sent a login link to <strong>{sentTo}</strong>. Open it on this phone and you'll be signed in. It can take a minute to arrive; check spam if it doesn't.
          </p>
          <button className="btn btn-block" onClick={() => setSentTo(null)}>
            Use a different email
          </button>
        </section>
      ) : (
        <form
          className="card stack-sm"
          aria-label="Sign in"
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
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error && (
            <p className="warning small" role="alert">
              <TriangleAlert size={16} aria-hidden /> {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={sending || !email.includes('@')}>
            {sending ? 'Sending…' : 'Email me a login link'}
          </button>
          <p className="muted small">No password: tap the link we email you. You'll stay signed in on this phone, and it works offline after that.</p>
        </form>
      )}
    </main>
  )
}
