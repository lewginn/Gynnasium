import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, RefreshCw, Trophy, TriangleAlert, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Avatar, { ProfileButton } from '../components/Avatar'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import { formatWhen } from '../lib/format'
import { checkFriendEmail, feedItems, groupFriends, leaderboardSince, rankLeaderboard, type FeedRow, type FriendGroups, type LeaderRow } from '../lib/friends'
import { FriendsError, acceptFriend, friendFeed, friendLeaderboard, friendList, removeFriend, sendFriendRequest } from '../social/friends'
import { useMyProfile } from '../social/profile'
import { useSync } from '../sync'

interface Loaded {
  groups: FriendGroups
  feed: FeedRow[]
  leaders: LeaderRow[]
}

const message = (e: unknown) => (e instanceof FriendsError ? e.message : 'Something went wrong. Try again.')
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** Social: this week's leaderboard, requests, friends' recent workouts and PRs, and your friends. */
export default function SocialPage() {
  const sync = useSync()
  const settings = useSettings()
  const profile = useMyProfile()
  const library = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])))
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, feed, leaders] = await Promise.all([friendList(), friendFeed(), friendLeaderboard(leaderboardSince(Date.now()))])
      setData({ groups: groupFriends(rows), feed, leaders })
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
  const ranked = useMemo(() => (data ? rankLeaderboard(data.leaders) : []), [data])

  return (
    <>
      <header className="page-header">
        <h1>Social</h1>
        <ProfileButton />
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
          {!profile.name && (
            <Link to="/profile" className="card list-row-split social-nudge">
              <span className="row">
                <Avatar name={sync.account?.email} src={profile.avatar} size={40} />
                <span>
                  <span className="list-title">Add your name and photo</span>
                  <span className="list-meta">So friends know it's you.</span>
                </span>
              </span>
              <ChevronRight size={20} aria-hidden className="muted" />
            </Link>
          )}

          {data.groups.incoming.length > 0 && (
            <>
              <h2 className="section-label">Requests</h2>
              <ul className="list">
                {data.groups.incoming.map((r) => (
                  <li key={r.id} className="list-row friend-row">
                    <Avatar name={r.name} src={r.avatar} />
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
              <h2 className="section-label">This week</h2>
              <ol className="list" aria-label="This week’s leaderboard">
                {ranked.map((r) => {
                  const body = (
                    <>
                      <span className={`leader-rank${r.rank === 1 && r.workouts > 0 ? ' first' : ''}`}>{r.rank}</span>
                      <Avatar name={r.name} src={r.avatar} size={36} />
                      <span className="grow">
                        <span className="list-title">{r.is_me ? 'You' : r.name}</span>
                        <span className="list-meta">
                          {plural(r.workouts, 'workout')} · {plural(r.sets, 'set')}
                        </span>
                      </span>
                    </>
                  )
                  return (
                    <li key={r.user_id}>
                      {r.is_me ? (
                        <div className="list-row leader-row leader-me">{body}</div>
                      ) : (
                        <Link to={`/social/${r.user_id}`} className="list-row leader-row">
                          {body}
                          <ChevronRight size={18} aria-hidden className="muted" />
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ol>
              <p className="muted small list-footer">Workouts since Monday, then working sets.</p>

              <h2 className="section-label">Recent workouts</h2>
              {items.length === 0 ? (
                <p className="muted small friends-empty">Nothing in the last 30 days.</p>
              ) : (
                <ul className="list" aria-label="Friends’ workouts">
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link to={`/social/${item.friendId}`} className="list-row friend-workout">
                        <Avatar name={item.who} src={item.avatar} />
                        <span className="grow">
                          <span className="list-title">
                            {item.who} · {item.workout}
                          </span>
                          <span className="list-meta when">
                            {formatWhen(item.startedAt)} · {plural(item.sets, 'set')}
                          </span>
                          {item.prs.map((pr, i) => (
                            <span key={i} className="friend-pr">
                              <Trophy size={12} aria-hidden className="pr-mark" />
                              <span>
                                {pr.exercise}: {pr.set}
                                <span className="muted"> · {pr.kinds}</span>
                              </span>
                            </span>
                          ))}
                        </span>
                      </Link>
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
            <ul className="list" aria-label="Friends">
              {data.groups.friends.map((f) => (
                <li key={f.id}>
                  <Link to={`/social/${f.friend_id}`} className="list-row friend-row">
                    <Avatar name={f.name} src={f.avatar} />
                    <span className="grow">
                      <span className="list-title">{f.name}</span>
                      <span className="list-meta">{f.email}</span>
                    </span>
                    <ChevronRight size={20} aria-hidden className="muted" />
                  </Link>
                </li>
              ))}
              {data.groups.outgoing.map((f) => (
                <li key={f.id} className="list-row friend-row">
                  <Avatar name={f.email} src={null} />
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
        </>
      )}

      {!data && !error && <p className="muted">Loading…</p>}
    </>
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
      <p className="muted small">They see it next time they open Social. Nothing is emailed.</p>
    </form>
  )
}
