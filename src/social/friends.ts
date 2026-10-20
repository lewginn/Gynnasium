import type { FeedRow, FriendProfileRow, FriendRow, LeaderRow } from '../lib/friends'

// Friends talk to Supabase directly (they're about other people's data, so there's nothing local to sync).
// Every call needs signal; failures come back as messages to show.

export class FriendsError extends Error {}

async function client() {
  if (!navigator.onLine) throw new FriendsError('You’re offline. Friends need signal.')
  const { supabase } = await import('../sync/supabase')
  if (!supabase) throw new FriendsError('Friends need an account, which this version of the app doesn’t have.')
  return supabase
}

function check<T>({ data, error }: { data: T; error: { message: string; code?: string } | null }): T {
  if (!error) return data
  if (error.code === '23505') throw new FriendsError('You’ve already asked them.')
  if (error.code === '42501') throw new FriendsError('You can’t send a request to that address.')
  if (error.code === 'PGRST202' || /does not exist/.test(error.message))
    throw new FriendsError('Friends aren’t set up on the server yet: the database needs its friends update.')
  throw new FriendsError(error.message)
}

export interface ProfileRow {
  display_name: string | null
  avatar: string | null
  share_workouts: boolean
  share_prs: boolean
}

export async function myProfile(): Promise<ProfileRow | null> {
  const db = await client()
  const rows = check(await db.from('profiles').select('display_name, avatar, share_workouts, share_prs').limit(1))
  return (rows as ProfileRow[])[0] ?? null
}

/** Creates or changes your profile; only the fields given change. */
export async function saveProfile(fields: Partial<ProfileRow>): Promise<void> {
  const db = await client()
  const { data } = await db.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new FriendsError('Sign in again to change your profile.')
  check(await db.from('profiles').upsert({ id, ...fields, updated_at: new Date().toISOString() }))
}

export async function friendList(): Promise<FriendRow[]> {
  return check(await (await client()).rpc('friend_list')) as FriendRow[]
}

export async function sendFriendRequest(email: string): Promise<void> {
  check(await (await client()).from('friendships').insert({ addressee_email: email }))
}

export async function acceptFriend(id: string): Promise<void> {
  check(await (await client()).rpc('accept_friend', { request_id: id }))
}

/** Declines a request, cancels one you sent, or removes a friend. */
export async function removeFriend(id: string): Promise<void> {
  check(await (await client()).from('friendships').delete().eq('id', id))
}

export async function friendFeed(days = 30): Promise<FeedRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  return check(await (await client()).rpc('friend_feed', { since })) as FeedRow[]
}

/** You and your friends since `since`: workouts and working sets. */
export async function friendLeaderboard(since: string): Promise<LeaderRow[]> {
  return check(await (await client()).rpc('friend_leaderboard', { since })) as LeaderRow[]
}

/** A friend's profile, or null if they aren't (or are no longer) your friend. */
export async function friendProfile(id: string): Promise<FriendProfileRow | null> {
  return (check(await (await client()).rpc('friend_profile', { friend: id })) as FriendProfileRow | null) ?? null
}
