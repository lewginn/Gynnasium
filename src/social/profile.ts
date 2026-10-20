import { useEffect, useSyncExternalStore } from 'react'
import { useSync } from '../sync'
import { myProfile, saveProfile, type ProfileRow } from './friends'

// Your own profile (name, photo, what friends see) lives in Supabase, where friends' functions read it.
// A copy is kept on the phone per account so the header photo shows straight away and offline.

export interface MyProfile {
  name: string | null
  avatar: string | null
  shareWorkouts: boolean
  sharePrs: boolean
}

const EMPTY: MyProfile = { name: null, avatar: null, shareWorkouts: true, sharePrs: true }
const key = (accountId: string) => `gynnasium.profile.${accountId}`
const listeners = new Set<() => void>()
const cache = new Map<string, MyProfile>()
const fetched = new Set<string>()

function read(accountId: string): MyProfile {
  if (!cache.has(accountId)) {
    let stored: MyProfile = EMPTY
    try {
      stored = { ...EMPTY, ...JSON.parse(localStorage.getItem(key(accountId)) ?? '{}') }
    } catch {
      // A broken copy is replaced on the next fetch.
    }
    cache.set(accountId, stored)
  }
  return cache.get(accountId)!
}

function write(accountId: string, profile: MyProfile) {
  cache.set(accountId, profile)
  try {
    localStorage.setItem(key(accountId), JSON.stringify(profile))
  } catch {
    // Storage full or blocked: the copy in memory still works until the app closes.
  }
  listeners.forEach((l) => l())
}

const fromRow = (r: ProfileRow | null): MyProfile =>
  r ? { name: r.display_name, avatar: r.avatar, shareWorkouts: r.share_workouts, sharePrs: r.share_prs } : EMPTY

/** Fetches your profile from the server (throws a FriendsError offline or on failure). */
export async function refreshMyProfile(accountId: string): Promise<MyProfile> {
  const profile = fromRow(await myProfile())
  write(accountId, profile)
  return profile
}

/** Saves changes to your profile. The phone's copy changes straight away, and goes back if the save fails. */
export async function updateMyProfile(accountId: string, fields: Partial<MyProfile>): Promise<void> {
  const row: Partial<ProfileRow> = {}
  if ('name' in fields) row.display_name = fields.name?.trim() || null
  if ('avatar' in fields) row.avatar = fields.avatar ?? null
  if ('shareWorkouts' in fields) row.share_workouts = fields.shareWorkouts
  if ('sharePrs' in fields) row.share_prs = fields.sharePrs
  const before = read(accountId)
  write(accountId, { ...before, ...fields, ...('name' in fields ? { name: row.display_name ?? null } : {}) })
  try {
    await saveProfile(row)
  } catch (e) {
    write(accountId, before)
    throw e
  }
}

/** Your profile as last seen, fetched fresh once per app start when there's signal. */
export function useMyProfile(): MyProfile {
  const accountId = useSync().account?.id
  const profile = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => (accountId ? read(accountId) : EMPTY),
  )
  useEffect(() => {
    if (!accountId || fetched.has(accountId) || !navigator.onLine) return
    fetched.add(accountId)
    refreshMyProfile(accountId).catch(() => fetched.delete(accountId))
  }, [accountId])
  return profile
}
