import { Mail, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { createAccount, sendLoginLink, signInWithPassword, useSync } from '../sync'

type Mode = 'password' | 'create' | 'link'

const MIN_PASSWORD = 8

/** Shown instead of the app until you sign in. Signing in is required so everything belongs to your account. */
export default function LoginScreen() {
  const sync = useSync()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [emailed, setEmailed] = useState<{ to: string; why: 'link' | 'confirm' } | null>(null)
  const [error, setError] = useState<string | null>(sync.linkError)

  if (sync.signingIn)
    return (
      <main className="content login" aria-busy="true">
        <h1>Gynnasium</h1>
        <p className="muted">Signing you in…</p>
      </main>
    )

  const switchTo = (m: Mode) => {
    setMode(m)
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    setBusy(true)
    setError(null)
    if (mode === 'password') {
      setError(await signInWithPassword(address, password))
    } else if (mode === 'create') {
      const res = await createAccount(address, password)
      if (res.error) setError(res.error)
      else if (res.confirm) setEmailed({ to: address, why: 'confirm' })
    } else {
      const err = await sendLoginLink(address)
      if (err) setError(err)
      else setEmailed({ to: address, why: 'link' })
    }
    setBusy(false)
  }

  const validEmail = email.includes('@')
  const ready = mode === 'link' ? validEmail : validEmail && password.length >= (mode === 'create' ? MIN_PASSWORD : 1)
  const action = { password: busy ? 'Signing in…' : 'Sign in', create: busy ? 'Creating account…' : 'Create account', link: busy ? 'Sending…' : 'Email me a login link' }[mode]

  return (
    <main className="content login">
      <h1>Gynnasium</h1>
      <p className="muted">Track your workouts, PRs and progress. Your plans, workouts and settings are saved to your account.</p>

      {emailed ? (
        <section className="card stack-sm" aria-labelledby="sent-heading">
          <h2 id="sent-heading" className="account-line">
            <Mail size={20} aria-hidden /> Check your email
          </h2>
          <p className="muted small">
            {emailed.why === 'link' ? 'We sent a login link to ' : 'To finish creating your account, open the link we sent to '}
            <strong>{emailed.to}</strong> on this phone. It can take a minute to arrive; check spam if it doesn't.
          </p>
          <button className="btn btn-block" onClick={() => setEmailed(null)}>
            Back
          </button>
        </section>
      ) : (
        <form className="card stack-sm" aria-label={mode === 'create' ? 'Create account' : 'Sign in'} onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete={mode === 'create' ? 'email' : 'username'}
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {mode !== 'link' && (
            <label className="field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'create' ? MIN_PASSWORD : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {mode === 'create' && <p className="muted small">At least {MIN_PASSWORD} characters.</p>}
          {error && (
            <p className="warning small" role="alert">
              <TriangleAlert size={16} aria-hidden /> {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !ready}>
            {action}
          </button>
          {mode === 'link' && <p className="muted small">Tap the link we email you and you're in. You'll stay signed in on this phone.</p>}
          <div className="login-alt">
            {mode !== 'password' && (
              <button type="button" className="btn btn-plain btn-sm" onClick={() => switchTo('password')}>
                {mode === 'create' ? 'I already have an account' : 'Sign in with a password'}
              </button>
            )}
            {mode !== 'create' && (
              <button type="button" className="btn btn-plain btn-sm" onClick={() => switchTo('create')}>
                Create an account
              </button>
            )}
            {mode !== 'link' && (
              <button type="button" className="btn btn-plain btn-sm" onClick={() => switchTo('link')}>
                Email me a login link instead
              </button>
            )}
          </div>
        </form>
      )}
    </main>
  )
}
