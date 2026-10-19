import type { Table } from 'dexie'
import { db, type GymDB } from '../db/db'
import { DEFAULT_SETTINGS, type LoggingType, type Settings, type Synced } from '../lib/types'
import { SYNCED_TABLES, fromRemote, toRemote, type Row, type SyncedTable } from './mapping'

/** The server side of sync. Implemented by Supabase in production and an in-memory fake in tests. */
export interface Remote {
  upsert(table: string, rows: Row[]): Promise<void>
  /** Rows changed after `since` (a server timestamp), oldest first, each with its `server_updated_at`. */
  pull(table: string, since: string | null, limit: number): Promise<Row[]>
  getSettings(): Promise<Row | null>
  putSettings(row: Row): Promise<void>
}

const PAGE = 500
const pushKey = (t: SyncedTable) => `sync.pushed.${t.local}`
const pullKey = (t: SyncedTable) => `sync.pulled.${t.local}`

const tableOf = (database: GymDB, t: SyncedTable) => database.table(t.local) as Table<Synced & Row, string>

async function getKv<T>(database: GymDB, key: string): Promise<T | undefined> {
  return (await database.kv.get(key))?.value as T | undefined
}

/**
 * One full sync: pull everything changed elsewhere, then push local changes.
 * Local-first: the app never waits on this. Conflicts resolve by last write wins on `updatedAt`.
 * Signing in as a different account resets the cursors, so this phone's data is merged into that account.
 */
export async function syncOnce(remote: Remote, userId: string, database: GymDB = db): Promise<void> {
  if ((await getKv<string>(database, 'sync.userId')) !== userId) {
    await database.kv.where('key').startsWith('sync.').delete()
    await database.kv.put({ key: 'sync.userId', value: userId })
  }
  // Pull first, so newer changes from elsewhere win locally before we push. The server also ignores
  // any write older than what it holds, so a stale copy can never overwrite a newer one.
  for (const t of SYNCED_TABLES) await pullTable(remote, t, database)
  for (const t of SYNCED_TABLES) await pushTable(remote, t, database)
  await syncSettings(remote, database)
}

async function pushTable(remote: Remote, t: SyncedTable, database: GymDB) {
  const since = (await getKv<number>(database, pushKey(t))) ?? 0
  // Captured before reading, so anything written while we push goes next time rather than being missed.
  const startedAt = Date.now()
  const changed = await tableOf(database, t).where('updatedAt').aboveOrEqual(since).toArray()
  for (let i = 0; i < changed.length; i += PAGE) await remote.upsert(t.remote, changed.slice(i, i + PAGE).map((r) => toRemote(t, r)))
  await database.kv.put({ key: pushKey(t), value: startedAt })
}

async function pullTable(remote: Remote, t: SyncedTable, database: GymDB) {
  let cursor = (await getKv<string>(database, pullKey(t))) ?? null
  for (;;) {
    const rows = await remote.pull(t.remote, cursor, PAGE)
    if (rows.length === 0) break
    await database.transaction('rw', tableOf(database, t), database.kv, async () => {
      const table = tableOf(database, t)
      const local = await table.bulkGet(rows.map((r) => r.id as string))
      const newer = rows
        .map((r) => fromRemote(t, r) as Synced & Row)
        .filter((incoming, i) => !local[i] || incoming.updatedAt >= local[i]!.updatedAt)
      await table.bulkPut(newer)
      cursor = rows[rows.length - 1].server_updated_at as string
      await database.kv.put({ key: pullKey(t), value: cursor })
    })
    if (rows.length < PAGE) break
  }
}

/** Settings and "log as" overrides travel together as one row, last write wins. */
async function syncSettings(remote: Remote, database: GymDB) {
  const localAt = (await getKv<number>(database, 'settingsUpdatedAt')) ?? 0
  const row = await remote.getSettings()
  const remoteAt = row?.updated_at ? Date.parse(row.updated_at as string) : -1

  if (row && remoteAt > localAt) {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      units: (row.units as Settings['units']) ?? DEFAULT_SETTINGS.units,
      defaultRestSec: (row.default_rest_sec as number) ?? DEFAULT_SETTINGS.defaultRestSec,
      showRpe: (row.show_rpe as boolean) ?? DEFAULT_SETTINGS.showRpe,
    }
    await database.kv.bulkPut([
      { key: 'settings', value: settings },
      { key: 'loggingOverrides', value: (row.logging_overrides as Record<string, LoggingType>) ?? {} },
      { key: 'settingsUpdatedAt', value: remoteAt },
    ])
  } else if (localAt > remoteAt) {
    const settings = { ...DEFAULT_SETTINGS, ...(await getKv<Partial<Settings>>(database, 'settings')) }
    await remote.putSettings({
      units: settings.units,
      default_rest_sec: settings.defaultRestSec,
      show_rpe: settings.showRpe,
      logging_overrides: (await getKv<Record<string, LoggingType>>(database, 'loggingOverrides')) ?? {},
      updated_at: new Date(localAt).toISOString(),
    })
  }
}
