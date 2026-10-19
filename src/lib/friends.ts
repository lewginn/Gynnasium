import { PR_LABELS } from './prs'
import { formatSet } from './summary'
import type { Exercise, PRType, SetLog, Settings } from './types'

// Shapes returned by the Supabase functions in supabase/migrations/20261022090000_friends.sql,
// and how the Friends page words them.

export interface FriendRow {
  id: string
  status: 'pending' | 'accepted'
  incoming: boolean
  name: string
  email: string
}

export interface FeedRow {
  friend_id: string
  friend_name: string
  session_id: string
  session_name: string
  started_at: string
  ended_at: string
  set_count: number
  prs: { exercise_id: string; weight_kg: number; reps: number; duration_sec: number | null; prs: PRType[] }[]
}

export interface FriendGroups {
  friends: FriendRow[]
  incoming: FriendRow[]
  outgoing: FriendRow[]
}

export function groupFriends(rows: FriendRow[]): FriendGroups {
  return {
    friends: rows.filter((r) => r.status === 'accepted'),
    incoming: rows.filter((r) => r.status === 'pending' && r.incoming),
    outgoing: rows.filter((r) => r.status === 'pending' && !r.incoming),
  }
}

export interface FeedItem {
  id: string
  who: string
  workout: string
  startedAt: number
  sets: number
  prs: { exercise: string; set: string; kinds: string }[]
}

/** A feed PR as a set row, so it's worded exactly like your own sets. */
const asSet = (p: FeedRow['prs'][number]): SetLog => ({
  id: '',
  sessionExerciseId: '',
  exerciseId: p.exercise_id,
  setNumber: 1,
  setType: 'working',
  weightKg: Number(p.weight_kg),
  reps: p.reps,
  durationSec: p.duration_sec ?? undefined,
  updatedAt: 0,
})

/** Friends' workouts with their PRs worded for display, using the local library for exercise names. */
export function feedItems(rows: FeedRow[], library: Map<string, Exercise>, settings: Pick<Settings, 'units'>): FeedItem[] {
  return rows.map((r) => ({
    id: r.session_id,
    who: r.friend_name,
    workout: r.session_name,
    startedAt: Date.parse(r.started_at),
    sets: r.set_count,
    prs: r.prs.map((p) => {
      const exercise = library.get(p.exercise_id)
      const logging = exercise?.logging ?? 'weight_reps'
      return {
        exercise: exercise?.name ?? p.exercise_id.replace(/_/g, ' '),
        set: formatSet(asSet(p), settings, logging),
        kinds: p.prs.map((k) => PR_LABELS[k] ?? k).join(' · '),
      }
    }),
  }))
}

/** Normalises an email for a request, or explains why it can't be sent. */
export function checkFriendEmail(input: string, own: string | undefined): { email: string } | { error: string } {
  const email = input.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'That doesn’t look like an email address.' }
  if (own && email === own.toLowerCase()) return { error: 'That’s your own email.' }
  return { email }
}
