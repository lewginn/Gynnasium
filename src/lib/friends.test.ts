import { describe, expect, it } from 'vitest'
import { checkFriendEmail, feedItems, groupFriends, type FriendRow } from './friends'
import type { Exercise } from './types'

const bench = { id: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Barbell Bench Press - Medium Grip', logging: 'weight_reps' } as Exercise

describe('friends', () => {
  it('splits friends from requests either way', () => {
    const rows: FriendRow[] = [
      { id: '1', status: 'accepted', incoming: false, name: 'Sam', email: 'sam@x.com' },
      { id: '2', status: 'pending', incoming: true, name: 'Jo', email: 'jo@x.com' },
      { id: '3', status: 'pending', incoming: false, name: 'al@x.com', email: 'al@x.com' },
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
