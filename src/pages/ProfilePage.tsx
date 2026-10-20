import { Camera, ChevronLeft, ChevronRight, Settings, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AccountCard from '../components/AccountCard'
import Avatar from '../components/Avatar'
import Sheet from '../components/Sheet'
import { photoToAvatar } from '../social/avatar'
import { FriendsError } from '../social/friends'
import { updateMyProfile, useMyProfile, type MyProfile } from '../social/profile'
import { useSync } from '../sync'

const message = (e: unknown) => (e instanceof FriendsError || e instanceof Error ? e.message : 'Something went wrong. Try again.')

/** You: how friends see you, what they can see, your account, and the way into Settings. */
export default function ProfilePage() {
  const navigate = useNavigate()
  const sync = useSync()
  const profile = useMyProfile()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const accountId = sync.account?.id

  /** Saves, returning the problem if it failed (also shown on the page). */
  const save = async (fields: Partial<MyProfile>): Promise<string | null> => {
    if (!accountId) return null
    try {
      await updateMyProfile(accountId, fields)
      setError(null)
      return null
    } catch (e) {
      setError(message(e))
      return message(e)
    }
  }

  return (
    <>
      <header className="page-header">
        <button className="back-link" onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))}>
          <ChevronLeft size={18} aria-hidden /> Back
        </button>
        <h1>Profile</h1>
      </header>

      <section className="card profile-card" aria-label="You">
        <Avatar name={profile.name ?? sync.account?.email} src={profile.avatar} size={88} />
        <span className="profile-name">{profile.name ?? 'No name yet'}</span>
        {sync.account && <span className="muted small">{sync.account.email}</span>}
        {accountId && (
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            Edit name and photo
          </button>
        )}
      </section>

      {error && (
        <p className="warning small profile-error" role="alert">
          <TriangleAlert size={16} aria-hidden /> {error}
        </p>
      )}

      {accountId && (
        <>
          <h2 className="section-label">Friends can see</h2>
          <ul className="list">
            <li>
              <label className="list-row toggle">
                <span>
                  Your workouts
                  <span className="muted small block">In their feed, on the weekly leaderboard, and your streak.</span>
                </span>
                <input type="checkbox" checked={profile.shareWorkouts} onChange={(e) => void save({ shareWorkouts: e.target.checked })} />
              </label>
            </li>
            <li>
              <label className="list-row toggle">
                <span>
                  Your PRs
                  <span className="muted small block">With your workouts, and your best lifts on your profile.</span>
                </span>
                <input type="checkbox" checked={profile.sharePrs} onChange={(e) => void save({ sharePrs: e.target.checked })} />
              </label>
            </li>
          </ul>
          <p className="muted small list-footer">Your name and photo are always shown to friends.</p>
        </>
      )}

      <AccountCard />

      <ul className="list">
        <li>
          <Link to="/settings" className="list-row list-row-split">
            <span className="row">
              <Settings size={20} aria-hidden className="muted" /> Settings
            </span>
            <ChevronRight size={20} aria-hidden className="muted" />
          </Link>
        </li>
      </ul>

      {editing && accountId && <EditSheet profile={profile} onClose={() => setEditing(false)} onSave={save} />}
    </>
  )
}

function EditSheet({ profile, onClose, onSave }: { profile: MyProfile; onClose: () => void; onSave: (fields: Partial<MyProfile>) => Promise<string | null> }) {
  const [name, setName] = useState(profile.name ?? '')
  const [avatar, setAvatar] = useState(profile.avatar)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  return (
    <Sheet title="Name and photo" onClose={onClose}>
      <form
        className="stack-sm"
        onSubmit={async (e) => {
          e.preventDefault()
          setSaving(true)
          const failed = await onSave({ name, avatar })
          setSaving(false)
          if (failed) setProblem(failed)
          else onClose()
        }}
      >
        <div className="profile-photo-edit">
          <Avatar name={name} src={avatar} size={88} />
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>
              <Camera size={16} aria-hidden /> {avatar ? 'Change photo' : 'Add photo'}
            </button>
            {avatar && (
              <button type="button" className="btn btn-sm btn-danger-text" onClick={() => setAvatar(null)}>
                Remove photo
              </button>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            aria-label="Photo"
            onChange={async (e) => {
              const chosen = e.target.files?.[0]
              e.target.value = ''
              if (!chosen) return
              try {
                setAvatar(await photoToAvatar(chosen))
                setProblem(null)
              } catch (err) {
                setProblem(message(err))
              }
            }}
          />
        </div>
        {problem && (
          <p className="warning small" role="alert">
            <TriangleAlert size={16} aria-hidden /> {problem}
          </p>
        )}
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} maxLength={40} placeholder="What friends see" onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="muted small">Without a name, friends see your email.</p>
        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Sheet>
  )
}
