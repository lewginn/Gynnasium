import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Remote } from './engine'
import type { Row } from './mapping'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Null when the build has no Supabase settings (local dev, CI): the app then runs local-only. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null

/** Row-level security scopes every query to the signed-in user, so no user filter is needed here. */
export class SupabaseRemote implements Remote {
  private client: SupabaseClient
  private userId: string

  constructor(client: SupabaseClient, userId: string) {
    this.client = client
    this.userId = userId
  }

  async upsert(table: string, rows: Row[]) {
    const { error } = await this.client.from(table).upsert(rows, { onConflict: 'id' })
    if (error) throw new Error(`${table}: ${error.message}`)
  }

  async pull(table: string, since: string | null, limit: number) {
    let query = this.client.from(table).select('*').order('server_updated_at', { ascending: true }).limit(limit)
    if (since) query = query.gt('server_updated_at', since)
    const { data, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)
    return data as Row[]
  }

  async getSettings() {
    const { data, error } = await this.client.from('user_settings').select('*').maybeSingle()
    if (error) throw new Error(`user_settings: ${error.message}`)
    return data as Row | null
  }

  async putSettings(row: Row) {
    const { error } = await this.client.from('user_settings').upsert({ ...row, user_id: this.userId }, { onConflict: 'user_id' })
    if (error) throw new Error(`user_settings: ${error.message}`)
  }
}
