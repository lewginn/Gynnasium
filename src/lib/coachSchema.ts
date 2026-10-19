// The contract between the app and /api/coach. Shared by both, so: no runtime imports, and .js import paths (the server runs it as plain Node ESM).
import type { Muscle } from './types.js'

export type CoachMode = 'build' | 'edit'

export interface CoachTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface CoachRequest {
  mode: CoachMode
  /** The whole chat so far, oldest first; the last turn is the user's. */
  turns: CoachTurn[]
  /** The current plan, recent training and settings, as text (see lib/coach.ts). */
  context: string
}

export interface ProposedExercise {
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  restSec: number
}

export interface ProposedDay {
  name: string
  focusMuscles: Muscle[]
  exercises: ProposedExercise[]
}

export interface ProposedPlan {
  name: string
  goal: string
  days: ProposedDay[]
}

export const CHANGE_OPS = [
  'add_exercise',
  'remove_exercise',
  'replace_exercise',
  'update_exercise',
  'move_exercise',
  'add_day',
  'remove_day',
  'rename_day',
  'rename_plan',
] as const

export type ChangeOp = (typeof CHANGE_OPS)[number]

/** One edit to the plan in the context. Days and exercises are referred to by the refs the context gives them (d1, x3). */
export interface PlanChange {
  op: ChangeOp
  day: string | null
  exercise: string | null
  exerciseId: string | null
  name: string | null
  sets: number | null
  repMin: number | null
  repMax: number | null
  restSec: number | null
  position: number | null
  exercises: ProposedExercise[] | null
  reason: string
}

export interface CoachReply {
  message: string
  newPlan: ProposedPlan | null
  changes: PlanChange[] | null
}

export interface CoachError {
  error: string
}

const MUSCLES: Muscle[] = [
  'abs',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower_back',
  'upper_back',
  'neck',
  'quads',
  'shoulders',
  'traps',
  'triceps',
]

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })

const exerciseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['exerciseId', 'sets', 'repMin', 'repMax', 'restSec'],
  properties: {
    exerciseId: { type: 'string', description: 'An id from the exercise catalogue, exactly as written there.' },
    sets: { type: 'integer' },
    repMin: { type: 'integer', description: 'Bottom of the rep range; seconds for timed exercises.' },
    repMax: { type: 'integer', description: 'Top of the rep range; seconds for timed exercises.' },
    restSec: { type: 'integer' },
  },
}

/** JSON schema for structured output: every reply has this shape. */
export const COACH_REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'newPlan', 'changes'],
  properties: {
    message: { type: 'string', description: 'What you say to the user. Plain text, short.' },
    newPlan: nullable({
      type: 'object',
      additionalProperties: false,
      required: ['name', 'goal', 'days'],
      properties: {
        name: { type: 'string' },
        goal: { type: 'string', description: 'One line: what the plan is for.' },
        days: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'focusMuscles', 'exercises'],
            properties: {
              name: { type: 'string' },
              focusMuscles: { type: 'array', items: { type: 'string', enum: MUSCLES } },
              exercises: { type: 'array', items: exerciseSchema },
            },
          },
        },
      },
    }),
    changes: nullable({
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'day', 'exercise', 'exerciseId', 'name', 'sets', 'repMin', 'repMax', 'restSec', 'position', 'exercises', 'reason'],
        properties: {
          op: { type: 'string', enum: [...CHANGE_OPS] },
          day: nullable({ type: 'string', description: 'Day ref, e.g. "d1".' }),
          exercise: nullable({ type: 'string', description: 'Plan exercise ref, e.g. "x3".' }),
          exerciseId: nullable({ type: 'string', description: 'Catalogue id of the exercise to add or swap in.' }),
          name: nullable({ type: 'string', description: 'New name, for add_day, rename_day and rename_plan.' }),
          sets: nullable({ type: 'integer' }),
          repMin: nullable({ type: 'integer' }),
          repMax: nullable({ type: 'integer' }),
          restSec: nullable({ type: 'integer' }),
          position: nullable({ type: 'integer', description: '1-based position within the day, for add_exercise and move_exercise.' }),
          exercises: nullable({ type: 'array', items: exerciseSchema, description: 'The exercises of a new day, for add_day.' }),
          reason: { type: 'string', description: 'Why, in a few words, shown next to the change.' },
        },
      },
    }),
  },
} as const
