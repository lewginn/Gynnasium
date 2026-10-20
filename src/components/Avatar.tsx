import { Link } from 'react-router-dom'
import { initials } from '../lib/friends'
import { useMyProfile } from '../social/profile'
import { useSync } from '../sync'

/** A round profile photo, or initials on gray when there isn't one. Decorative: say who it is in the text next to it. */
export default function Avatar({ name, src, size = 40 }: { name: string | null | undefined; src: string | null | undefined; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden>
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  )
}

/** Your photo at the trailing end of a tab's large title, opening Profile (as in Apple's own apps). */
export function ProfileButton() {
  const sync = useSync()
  const profile = useMyProfile()
  return (
    <Link to="/profile" className="profile-button" aria-label="Profile">
      <Avatar name={profile.name ?? sync.account?.email} src={profile.avatar} size={36} />
    </Link>
  )
}
