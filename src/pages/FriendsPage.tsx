import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, RefreshCw, Trophy, TriangleAlert, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import { formatDay } from '../lib/format'
import { checkFriendEmail, feedItems, groupFriends, type FeedRow, type FriendGroups } from '../lib/friends'
import {
  FriendsError,
  acceptFriend,
  friendFeed,
  friendList,
  myDisplayName,
  removeFriend,
  sendFriendRequest,
  setDisplayName,
} from '../social/friends'
import { useConfirm } from '../state/confirm'
import { useSync } from '../sync'

interface Loaded {
  name: string | null
  groups: FriendGroups
  feed: FeedRow[]
}

const message = (e: unknown) => (e instanceof FriendsError ? e.message : 'Something went wrong. Try again.')

/** Friends: add people by email; once they accept, you see each other's recent workouts and PRs. */
export default function FriendsPage() {
  const sync = useSync()
  const settings = useSettings()
  const confirm = useConfirm()
  const library = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])))
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [name, rows, feed] = await Promise.all([myDisplayName(), friendList(), friendFeed()])
      setData({ name, groups: groupFriends(rows), feed })
      setError(null)
    } catch (e) {
      setError(message(e))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  /** Runs an action, then reloads; an error shows at the top. */
  const act = (action: () => Promise<void>) => async () => {
    try {
      await action()
      await load()
    } catch (e) {
      setError(message(e))
    }
  }

  const items = useMemo(() => (data && library ? feedItems(data.feed, library, settings) : []), [data, library, settings])

  return (
    <>
      <header className="page-header">
        <Link to="/progress" className="back-link">
          <ChevronLeft size={18} aria-hidden /> Progress
        </Link>
        <h1>Friends</h1>
        <p className="muted">Add friends by email. Once they accept, you each see the other's recent workouts and PRs.</p>
      </header>

      {error && (
        <div className="card">
          <p className="warning small" role="alert">
            <TriangleAlert size={16} aria-hidden /> {error}
          </p>
          <button className="btn btn-sm btn-block" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} aria-hidden /> Try again
          </button>
        </div>
      )}

      {data && (
        <>
          {!data.name && <NameCard name={data.name} onSave={(name) => act(() => setDisplayName(name))()} />}

          {data.groups.incoming.length > 0 && (
            <>
              <h2 className="section-label">Requests</h2>
              <ul className="list">
                {data.groups.incoming.map((r) => (
                  <li key={r.id} className="list-row friend-row">
                    <span className="grow">
                      <span className="list-title">{r.name}</span>
                      <span className="list-meta">{r.email}</span>
                    </span>
                    <button className="btn btn-sm" onClick={act(() => removeFriend(r.id))} aria-label={`Decline ${r.name}`}>
                      Decline
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={act(() => acceptFriend(r.id))} aria-label={`Accept ${r.name}`}>
                      Accept
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {data.groups.friends.length > 0 && (
            <>
              <h2 className="section-label">Recent workouts</h2>
              {items.length === 0 ? (
                <p className="muted small friends-empty">Nothing in the last 30 days.</p>
              ) : (
                <ul className="list" aria-label="Friends’ workouts">
                  {items.map((item) => (
                    <li key={item.id} className="list-row friend-workout">
                      <span className="list-title">
                        {item.who} · {item.workout}
                      </span>
                      <span className="list-meta">
                        {formatDay(item.startedAt)} · {item.sets} {item.sets === 1 ? 'set' : 'sets'}
                      </span>
                      {item.prs.map((pr, i) => (
                        <span key={i} className="friend-pr">
                          <Trophy size={12} aria-hidden className="pr-mark" /> {pr.exercise}: {pr.set}
                          <span className="muted"> · {pr.kinds}</span>
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <h2 className="section-label">Friends</h2>
          {data.groups.friends.length === 0 && data.groups.outgoing.length === 0 ? (
            <p className="muted small friends-empty">No friends yet.</p>
          ) : (
            <ul className="list">
              {data.groups.friends.map((f) => (
                <li key={f.id} className="list-row friend-row">
                  <span className="grow">
                    <span className="list-title">{f.name}</span>
                    <span className="list-meta">{f.email}</span>
                  </span>
                  <button
                    className="btn btn-sm btn-danger-text"
                    aria-label={`Remove ${f.name}`}
                    onClick={async () => {
                      if (await confirm({ title: `Remove ${f.name}?`, message: 'You stop seeing each other’s workouts.', action: 'Remove friend', destructive: true }))
                        await act(() => removeFriend(f.id))()
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {data.groups.outgoing.map((f) => (
                <li key={f.id} className="list-row friend-row">
                  <span className="grow">
                    <span className="list-title">{f.email}</span>
                    <span className="list-meta">Waiting for them to accept</span>
                  </span>
                  <button className="btn btn-sm" onClick={act(() => removeFriend(f.id))} aria-label={`Cancel request to ${f.email}`}>
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}

          <AddFriend own={sync.account?.email} onSend={(email) => act(() => sendFriendRequest(email))()} />
          {data.name && <NameCard name={data.name} onSave={(name) => act(() => setDisplayName(name))()} />}
        </>
      )}

      {!data && !error && <p className="muted">Loading…</p>}
    </>
  )
}

function NameCard({ name, onSave }: { name: string | null; onSave: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name ?? '')
  if (name && !editing)
    return (
      <section className="card row">
        <span className="grow">
          Friends see you as <strong>{name}</strong>
        </span>
        <button className="btn btn-sm" onClick={() => setEditing(true)}>
          Change
        </button>
      </section>
    )
  return (
    <form
      className="card stack-sm"
      aria-label="Your name"
      onSubmit={async (e) => {
        e.preventDefault()
        await onSave(value)
        setEditing(false)
      }}
    >
      <label className="field">
        <span>Your name</span>
        <input className="input" value={value} maxLength={40} required placeholder="What friends see" onChange={(e) => setValue(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary btn-block" disabled={!value.trim()}>
        Save name
      </button>
    </form>
  )
}

function AddFriend({ own, onSend }: { own: string | undefined; onSend: (email: string) => Promise<void> }) {
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const checked = checkFriendEmail(value, own)
    if ('error' in checked) return setProblem(checked.error)
    setProblem(null)
    await onSend(checked.email)
    setValue('')
  }
  return (
    <form className="card stack-sm" aria-label="Add a friend" onSubmit={submit}>
      <label className="field">
        <span>Add a friend</span>
        <input
          className="input"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="Their email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {problem && (
        <p className="warning small" role="alert">
          <TriangleAlert size={16} aria-hidden /> {problem}
        </p>
      )}
      <button type="submit" className="btn btn-block" disabled={!value.trim()}>
        <UserPlus size={18} aria-hidden /> Send request
      </button>
      <p className="muted small">They see it next time they open Friends. Nothing is emailed.</p>
    </form>
  )
}
