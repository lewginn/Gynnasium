import { SYNCED_TABLES } from './mapping'
import { db, type GymDB } from '../db/db'

/** Tables holding a user's own data (everything synced). The exercise library is shared and never cleared. */
/** Every synced table belongs to the account (derived, so a new table can't be missed). */
const USER_TABLES = SYNCED_TABLES.map((t) => t.local)
/** Device-level keys that survive an account switch. */
const DEVICE_KEYS = new Set(['libraryVersion'])

/**
 * Makes this phone's data belong to `userId` before anything is shown or synced:
 * - no owner yet (data logged before sign-in was required, or a fresh install): adopt it into this account
 * - same owner: keep everything, including changes not yet backed up
 * - a different owner: clear their data from the phone; it's safe in their own account
 * Returns what happened, for the UI and tests.
 */
export async function claimDevice(userId: string, database: GymDB = db): Promise<'adopted' | 'kept' | 'switched'> {
  const owner = (await database.kv.get('ownerUserId'))?.value as string | undefined
  if (owner === userId) return 'kept'
  if (owner) {
    await database.transaction('rw', [...USER_TABLES.map((t) => database.table(t)), database.kv], async () => {
      await Promise.all(USER_TABLES.map((t) => database.table(t).clear()))
      await database.kv.filter((row) => !DEVICE_KEYS.has(row.key)).delete()
    })
    try {
      localStorage.removeItem('gynnasium.restTimer')
    } catch {
      // ignore
    }
  }
  await database.kv.put({ key: 'ownerUserId', value: userId })
  return owner ? 'switched' : 'adopted'
}
