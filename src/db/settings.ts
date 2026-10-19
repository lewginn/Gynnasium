import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_SETTINGS, type Settings } from '../lib/types'
import { db } from './db'

export function useSettings(): Settings {
  const stored = useLiveQuery(() => db.kv.get('settings'))
  return { ...DEFAULT_SETTINGS, ...(stored?.value as Partial<Settings> | undefined) }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await db.transaction('rw', db.kv, async () => {
    const stored = (await db.kv.get('settings'))?.value as Partial<Settings> | undefined
    await db.kv.bulkPut([
      { key: 'settings', value: { ...DEFAULT_SETTINGS, ...stored, ...patch } },
      { key: 'settingsUpdatedAt', value: Date.now() }, // for sync: settings are one last-write-wins row
    ])
  })
}
