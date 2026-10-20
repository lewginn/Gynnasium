// Converts between local Dexie rows (camelCase, ms timestamps) and Supabase rows (snake_case, ISO timestamps).

export type Row = Record<string, unknown>

/** Synced tables in dependency order: parents before children, so foreign keys hold when pushing. */
export const SYNCED_TABLES = [
  {
    local: 'goals',
    remote: 'goals',
    columns: ['id', 'name', 'description', 'starts_on', 'target_date', 'targets', 'calories', 'protein_g', 'nutrition_note', 'is_active'],
  },
  { local: 'plans', remote: 'plans', columns: ['id', 'name', 'goal', 'is_active', 'created_by', 'goal_id', 'starts_on', 'ends_on'] },
  { local: 'planDays', remote: 'plan_days', columns: ['id', 'plan_id', 'name', 'order', 'focus_muscles', 'week', 'weekdays'] },
  {
    local: 'planExercises',
    remote: 'plan_exercises',
    columns: [
      'id',
      'plan_day_id',
      'exercise_id',
      'order',
      'superset_group',
      'target_sets',
      'rep_min',
      'rep_max',
      'target_rpe',
      'rest_sec',
      'progression_rule',
      'alternates',
    ],
  },
  { local: 'sessions', remote: 'workout_sessions', columns: ['id', 'plan_day_id', 'name', 'started_at', 'ended_at', 'notes'] },
  {
    local: 'sessionExercises',
    remote: 'session_exercises',
    columns: ['id', 'session_id', 'exercise_id', 'order', 'swapped_from_exercise_id', 'notes'],
  },
  {
    local: 'setLogs',
    remote: 'set_logs',
    columns: [
      'id',
      'session_exercise_id',
      'exercise_id',
      'set_number',
      'set_type',
      'weight_kg',
      'reps',
      'duration_sec',
      'rpe',
      'completed_at',
      'prs',
    ],
  },
  { local: 'bodyMetrics', remote: 'body_metrics', columns: ['id', 'type', 'value', 'date', 'source'] },
  { local: 'daysOff', remote: 'days_off', columns: ['id', 'date', 'note'] },
] as const

export type SyncedTable = (typeof SYNCED_TABLES)[number]

/** Array (or JSON array) columns with a non-null default: send [] rather than null. */
const ARRAY_COLUMNS = new Set(['focus_muscles', 'alternates', 'prs', 'weekdays', 'targets'])
/** Columns every synced table has. Server-only columns (user_id, server_updated_at) are never sent. */
const COMMON = ['updated_at', 'deleted_at']

const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const isTimestamp = (column: string) => column.endsWith('_at')

/**
 * Every column is sent, with null for anything unset, so clearing a field locally (e.g. un-ticking a set
 * clears completed_at) clears it on the server too.
 */
export function toRemote(table: SyncedTable, row: Row): Row {
  const out: Row = {}
  for (const column of [...table.columns, ...COMMON]) {
    const value = row[toCamel(column)]
    if (value === undefined || value === null) out[column] = ARRAY_COLUMNS.has(column) ? [] : null
    else if (isTimestamp(column)) out[column] = new Date(value as number).toISOString()
    else out[column] = value
  }
  return out
}

export function fromRemote(table: SyncedTable, row: Row): Row {
  const out: Row = {}
  for (const column of [...table.columns, ...COMMON]) {
    const value = row[column]
    if (value === null || value === undefined) continue
    out[toCamel(column)] = isTimestamp(column) ? Date.parse(value as string) : value
  }
  return out
}
