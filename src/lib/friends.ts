import { estimate1RM } from './e1rm'
import { PR_LABELS } from './prs'
import { formatSet } from './summary'
import type { Exercise, PRType, SetLog, Settings } from './types'
import { startOfWeek, weekStreak } from './week'

// Shapes returned by the Supabase functions in supabase/migrations/20261022090000_friends.sql and
// 20261024090000_social.sql, and how the Social pages word them.

export interface FriendRow {
  /** The friendship (request) id. */
  id: string
  status: 'pending' | 'accepted'
  incoming: boolean
  /** The friend's user id, once accepted. */
  friend_id: string | null
  name: string
  email: string
  avatar: string | null
}

export interface FeedRow {
  friend_id: string
  friend_name: string
  friend_avatar: string | null
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
  friendId: string
  who: string
  avatar: string | null
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
    friendId: r.friend_id,
    who: r.friend_name,
    avatar: r.friend_avatar,
    workout: r.session_name,
    startedAt: Date.parse(r.started_at),
    sets: r.set_count,
    prs: r.prs.map((p) => wordPR(p, library, settings)),
  }))
}

type PRRow = FeedRow['prs'][number]

/** How a PR set reads: "Barbell Squat", "120kg × 5", "Heaviest weight". */
function wordPR(p: PRRow, library: Map<string, Exercise>, settings: Pick<Settings, 'units'>) {
  const exercise = library.get(p.exercise_id)
  return {
    exercise: exercise?.name ?? p.exercise_id.replace(/_/g, ' '),
    set: formatSet(asSet(p), settings, exercise?.logging ?? 'weight_reps'),
    kinds: p.prs.map((k) => PR_LABELS[k] ?? k).join(' · '),
  }
}

export interface LeaderRow {
  user_id: string
  name: string
  avatar: string | null
  is_me: boolean
  workouts: number
  sets: number
}

export interface Ranked extends LeaderRow {
  /** 1 for the top; people level on workouts and sets share a rank. */
  rank: number
}

/** This week's leaderboard: most workouts first, then most working sets. */
export function rankLeaderboard(rows: LeaderRow[]): Ranked[] {
  const sorted = [...rows].sort((a, b) => b.workouts - a.workouts || b.sets - a.sets || Number(b.is_me) - Number(a.is_me) || a.name.localeCompare(b.name))
  return sorted.map((r, i) => {
    let rank = i + 1
    for (let j = i - 1; j >= 0 && sorted[j].workouts === r.workouts && sorted[j].sets === r.sets; j--) rank = j + 1
    return { ...r, rank }
  })
}

export interface FriendProfileRow {
  name: string
  avatar: string | null
  share_workouts: boolean
  share_prs: boolean
  /** Workout start times over the last year, if they share workouts. */
  workout_starts: string[] | null
  best_lifts: { exercise_id: string; weight_kg: number; reps: number; at: string }[] | null
  recent_prs: (PRRow & { at: string })[] | null
}

export interface FriendStats {
  /** Null when they don't share workouts. */
  thisMonth: number | null
  streak: number | null
  /** Null when they don't share PRs. */
  bestLifts: { exercise: string; e1rm: number; set: string }[] | null
  recentPRs: { exercise: string; set: string; kinds: string; at: number }[] | null
}

/** A friend's profile in numbers: workouts this month, week streak, best lifts by est. 1RM, recent PRs. */
export function friendStats(p: FriendProfileRow, library: Map<string, Exercise>, settings: Pick<Settings, 'units'>, now: number): FriendStats {
  const starts = p.workout_starts?.map((s) => Date.parse(s)) ?? null
  const month = new Date(now)
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1).getTime()
  const bestLifts =
    p.best_lifts
      ?.map((b) => {
        const exercise = library.get(b.exercise_id)
        const set = { exercise_id: b.exercise_id, weight_kg: Number(b.weight_kg), reps: b.reps, duration_sec: null, prs: [] }
        return { exercise: exercise?.name ?? b.exercise_id.replace(/_/g, ' '), e1rm: estimate1RM(set.weight_kg, b.reps) ?? set.weight_kg, set: wordPR(set, library, settings).set }
      })
      .sort((a, b) => b.e1rm - a.e1rm) ?? null
  return {
    thisMonth: starts ? starts.filter((t) => t >= monthStart).length : null,
    streak: starts ? weekStreak(starts, now) : null,
    bestLifts,
    recentPRs: p.recent_prs?.map((r) => ({ ...wordPR(r, library, settings), at: Date.parse(r.at) })) ?? null,
  }
}

/** Monday 00:00 this week, local time: where the leaderboard starts counting. */
export const leaderboardSince = (now: number) => new Date(startOfWeek(now)).toISOString()

/** Up to two initials for an avatar without a photo: "Lewis Ginn" → "LG", "sam@x.com" → "S". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return ''
  return (words.length === 1 ? words[0][0] : words[0][0] + words.at(-1)![0]).toUpperCase()
}

/** Normalises an email for a request, or explains why it can't be sent. */
export function checkFriendEmail(input: string, own: string | undefined): { email: string } | { error: string } {
  const email = input.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'That doesn’t look like an email address.' }
  if (own && email === own.toLowerCase()) return { error: 'That’s your own email.' }
  return { email }
}
