import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, RefreshCw, Trophy, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import { formatDay, formatWhen } from '../lib/format'
import { feedItems, friendStats, type FeedRow, type FriendProfileRow, type FriendRow } from '../lib/friends'
import { formatEstimate } from '../lib/units'
import { FriendsError, friendFeed, friendList, friendProfile, removeFriend } from '../social/friends'
import { useConfirm } from '../state/confirm'

interface Loaded {
  profile: FriendProfileRow | null
  friendship: FriendRow | undefined
  feed: FeedRow[]
}

const message = (e: unknown) => (e instanceof FriendsError ? e.message : 'Something went wrong. Try again.')

/** One friend: this month, week streak, best lifts, recent PRs and workouts (whatever they share). */
export default function FriendPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const settings = useSettings()
  const library = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])))
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [profile, rows, feed] = await Promise.all([friendProfile(id), friendList(), friendFeed()])
      setData({ profile, friendship: rows.find((r) => r.friend_id === id), feed: feed.filter((f) => f.friend_id === id) })
      setError(null)
    } catch (e) {
      setError(message(e))
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => (data?.profile && library ? friendStats(data.profile, library, settings, Date.now()) : null), [data, library, settings])
  const workouts = useMemo(() => (data && library ? feedItems(data.feed, library, settings) : []), [data, library, settings])
  const p = data?.profile

  return (
    <>
      <header className="page-header">
        <Link to="/social" className="back-link">
          <ChevronLeft size={18} aria-hidden /> Social
        </Link>
        {p && <h1>{p.name}</h1>}
      </header>

      {error && (
        <div className="card">
          <p className="warning small" role="alert">
            <TriangleAlert size={16} aria-hidden /> {error}
          </p>
          <button className="btn btn-sm btn-block" onClick={() => void load()}>
            <RefreshCw size={16} aria-hidden /> Try again
          </button>
        </div>
      )}

      {data && !p && <p className="muted">You’re not friends with this person.</p>}

      {p && stats && (
        <>
          <section className="card friend-hero" aria-label="Their stats">
            <Avatar name={p.name} src={p.avatar} size={72} />
            {stats.thisMonth !== null ? (
              <dl className="friend-stats">
                <div>
                  <dt>This month</dt>
                  <dd>{stats.thisMonth}</dd>
                </div>
                <div>
                  <dt>Week streak</dt>
                  <dd>{stats.streak}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted small">{p.name} doesn’t share workouts.</p>
            )}
          </section>

          {stats.bestLifts && stats.bestLifts.length > 0 && (
            <>
              <h2 className="section-label">Best lifts</h2>
              <ul className="list" aria-label="Best lifts">
                {stats.bestLifts.map((b) => (
                  <li key={b.exercise} className="list-row list-row-split">
                    <span>
                      <span className="list-title">{b.exercise}</span>
                      <span className="list-meta">{b.set}</span>
                    </span>
                    <span className="friend-e1rm">
                      {formatEstimate(b.e1rm, settings.units)}
                      <span className="muted small block">est. 1RM</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {stats.recentPRs && stats.recentPRs.length > 0 && (
            <>
              <h2 className="section-label">Recent PRs</h2>
              <ul className="list" aria-label="Recent PRs">
                {stats.recentPRs.map((pr, i) => (
                  <li key={i} className="list-row">
                    <span className="list-title">
                      <Trophy size={12} aria-hidden className="pr-mark" /> {pr.exercise}: {pr.set}
                    </span>
                    <span className="list-meta">
                      {formatDay(pr.at)} · {pr.kinds}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {!p.share_prs && <p className="muted small friends-empty">{p.name} doesn’t share PRs.</p>}

          {workouts.length > 0 && (
            <>
              <h2 className="section-label">Recent workouts</h2>
              <ul className="list">
                {workouts.map((w) => (
                  <li key={w.id} className="list-row">
                    <span className="list-title">{w.workout}</span>
                    <span className="list-meta when">
                      {formatWhen(w.startedAt)} · {w.sets} {w.sets === 1 ? 'set' : 'sets'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {data.friendship && (
            <button
              className="btn btn-block btn-danger-text"
              onClick={async () => {
                if (!(await confirm({ title: `Remove ${p.name}?`, message: 'You stop seeing each other’s workouts.', action: 'Remove friend', destructive: true }))) return
                try {
                  await removeFriend(data.friendship!.id)
                  navigate('/social')
                } catch (e) {
                  setError(message(e))
                }
              }}
            >
              Remove friend
            </button>
          )}
        </>
      )}

      {!data && !error && <p className="muted">Loading…</p>}
    </>
  )
}
