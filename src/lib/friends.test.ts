import { describe, expect, it } from 'vitest'
import { checkFriendEmail, feedItems, friendStats, groupFriends, initials, rankLeaderboard, type FriendProfileRow, type FriendRow, type LeaderRow } from './friends'
import type { Exercise } from './types'

const bench = { id: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Barbell Bench Press - Medium Grip', logging: 'weight_reps' } as Exercise

describe('friends', () => {
  it('splits friends from requests either way', () => {
    const rows: FriendRow[] = [
      { id: '1', status: 'accepted', incoming: false, friend_id: 'u1', name: 'Sam', email: 'sam@x.com', avatar: null },
      { id: '2', status: 'pending', incoming: true, friend_id: null, name: 'Jo', email: 'jo@x.com', avatar: null },
      { id: '3', status: 'pending', incoming: false, friend_id: null, name: 'al@x.com', email: 'al@x.com', avatar: null },
    ]
    const g = groupFriends(rows)
    expect([g.friends, g.incoming, g.outgoing].map((l) => l.map((r) => r.id))).toEqual([['1'], ['2'], ['3']])
  })

  it('words feed PRs like your own sets, in your units', () => {
    const [item] = feedItems(
      [
        {
          friend_id: 'f',
          friend_name: 'Sam',
          friend_avatar: null,
          session_id: 's',
          session_name: 'Push',
          started_at: '2026-10-19T17:00:00Z',
          ended_at: '2026-10-19T18:00:00Z',
          set_count: 12,
          prs: [{ exercise_id: bench.id, weight_kg: 100, reps: 5, duration_sec: null, prs: ['max_weight', 'max_e1rm'] }],
        },
      ],
      new Map([[bench.id, bench]]),
      { units: 'kg' },
    )
    expect(item).toMatchObject({ who: 'Sam', workout: 'Push', sets: 12 })
    expect(item.prs).toEqual([{ exercise: 'Barbell Bench Press - Medium Grip', set: '100kg × 5', kinds: 'Heaviest weight · Best est. 1RM' }])
  })

  it('checks emails before sending a request', () => {
    expect(checkFriendEmail('  Sam@X.com ', 'me@x.com')).toEqual({ email: 'sam@x.com' })
    expect(checkFriendEmail('me@x.com', 'ME@x.com')).toEqual({ error: 'That’s your own email.' })
    expect(checkFriendEmail('sam', 'me@x.com')).toHaveProperty('error')
  })
})

describe('social', () => {
  const row = (name: string, workouts: number, sets: number, is_me = false): LeaderRow => ({ user_id: name, name, avatar: null, is_me, workouts, sets })

  it('ranks the week by workouts, then sets; level people share a rank', () => {
    const ranked = rankLeaderboard([row('Al', 2, 30), row('Me', 3, 40, true), row('Jo', 3, 50), row('Sam', 2, 30)])
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ['Jo', 1],
      ['Me', 2],
      ['Al', 3],
      ['Sam', 3],
    ])
  })

  it('a friend in numbers: this month, week streak, best lifts by est. 1RM, PRs', () => {
    const now = new Date(2026, 9, 20, 12).getTime() // Tue 20 Oct
    const at = (d: number) => new Date(2026, 9, d, 18).toISOString()
    const p: FriendProfileRow = {
      name: 'Sam',
      avatar: null,
      share_workouts: true,
      share_prs: true,
      workout_starts: [at(19), at(14), at(7), at(1), new Date(2026, 8, 28, 18).toISOString()],
      best_lifts: [
        { exercise_id: 'Squat', weight_kg: 100, reps: 10, at: at(14) },
        { exercise_id: bench.id, weight_kg: 110, reps: 1, at: at(7) },
      ],
      recent_prs: [{ exercise_id: bench.id, weight_kg: 110, reps: 1, duration_sec: null, prs: ['max_weight'], at: at(7) }],
    }
    const s = friendStats(p, new Map([[bench.id, bench]]), { units: 'kg' }, now)
    expect(s.thisMonth).toBe(4)
    expect(s.streak).toBe(4) // this week, and the three before
    expect(s.bestLifts!.map((b) => [b.exercise, b.set])).toEqual([
      ['Squat', '100kg × 10'], // ≈ 133 est. 1RM beats a 110 single
      ['Barbell Bench Press - Medium Grip', '110kg × 1'],
    ])
    expect(s.recentPRs![0]).toMatchObject({ set: '110kg × 1', kinds: 'Heaviest weight' })
  })

  it('shows nothing for what a friend doesn\u2019t share', () => {
    const s = friendStats({ name: 'Jo', avatar: null, share_workouts: false, share_prs: false, workout_starts: null, best_lifts: null, recent_prs: null }, new Map(), { units: 'kg' }, Date.now())
    expect(s).toEqual({ thisMonth: null, streak: null, bestLifts: null, recentPRs: null })
  })

  it('initials for an avatar without a photo', () => {
    expect(initials('Lewis Ginn')).toBe('LG')
    expect(initials('sam')).toBe('S')
    expect(initials('jo.bloggs@example.com')).toBe('JB')
    expect(initials('')).toBe('')
  })
})
