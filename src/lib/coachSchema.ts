// The contract between the app and /api/coach. Shared by both, so: no runtime imports, and .js import paths (the server runs it as plain Node ESM).
import type { Muscle } from './types.js'

export type CoachMode = 'build' | 'edit' | 'goal'

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
  /** Alternating weeks: 1 = week A, 2 = week B; null when every week is the same. */
  week: 1 | 2 | null
  /** Weekdays it's trained on, 0 = Monday … 6 = Sunday; null for no fixed days. */
  weekdays: number[] | null
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
  'set_day_week',
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
  week: 1 | 2 | null
  reason: string
}

/** One block of a plan to a goal date, e.g. "Build" for six weeks. Dates are YYYY-MM-DD, inclusive. */
export interface ProposedPhase {
  name: string
  startsOn: string
  endsOn: string
  focus: string
  plan: ProposedPlan
}

export interface ProposedNutrition {
  calories: number
  proteinG: number
  note: string
}

export interface ProposedGoalPlan {
  phases: ProposedPhase[]
  nutrition: ProposedNutrition | null
}

export interface CoachReply {
  message: string
  newPlan: ProposedPlan | null
  changes: PlanChange[] | null
  /** Goal mode: phases from today to the goal date, with nutrition targets. */
  goalPlan: ProposedGoalPlan | null
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

const planSchema = {
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
            required: ['name', 'focusMuscles', 'exercises', 'week', 'weekdays'],
            properties: {
              name: { type: 'string' },
              focusMuscles: { type: 'array', items: { type: 'string', enum: MUSCLES } },
              exercises: { type: 'array', items: exerciseSchema },
              week: nullable({ type: 'integer', enum: [1, 2], description: 'Alternating weeks: 1 = week A, 2 = week B. Null when every week is the same.' }),
              weekdays: nullable({
                type: 'array',
                items: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6] },
                description: 'Weekdays this day is trained on: 0 = Monday … 6 = Sunday. Null for no fixed days.',
              }),
            },
          },
        },
      },
    }

/** Each mode's proposal field. A mode's reply only has its own, so the server fills the others in with null. */
const PROPOSAL_SCHEMAS = {
  newPlan: nullable(planSchema),
  changes: nullable({
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['op', 'day', 'exercise', 'exerciseId', 'name', 'sets', 'repMin', 'repMax', 'restSec', 'position', 'exercises', 'week', 'reason'],
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
        week: nullable({ type: 'integer', enum: [1, 2], description: 'For add_day and set_day_week: 1 = week A, 2 = week B; null = every week.' }),
        reason: { type: 'string', description: 'Why, in a few words, shown next to the change.' },
      },
    },
  }),
  goalPlan: nullable({
    type: 'object',
    additionalProperties: false,
    required: ['phases', 'nutrition'],
    properties: {
      phases: {
        type: 'array',
        description: 'Back to back, from today to the goal date, in order.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'startsOn', 'endsOn', 'focus', 'plan'],
          properties: {
            name: { type: 'string', description: 'Short, e.g. "Build", "Lean out", "Taper".' },
            startsOn: { type: 'string', format: 'date' },
            endsOn: { type: 'string', format: 'date', description: 'Inclusive.' },
            focus: { type: 'string', description: 'One line: what this phase is for.' },
            plan: planSchema,
          },
        },
      },
      nutrition: nullable({
        type: 'object',
        additionalProperties: false,
        required: ['calories', 'proteinG', 'note'],
        properties: {
          calories: { type: 'integer', description: 'Daily calories.' },
          proteinG: { type: 'integer', description: 'Daily protein in grams.' },
          note: { type: 'string', description: 'One or two plain sentences on how to use the targets.' },
        },
      }),
    },
  }),
}

const PROPOSAL_FIELD = { build: 'newPlan', edit: 'changes', goal: 'goalPlan' } as const

/**
 * JSON schema for structured output in one mode: the message, plus that mode's proposal. One schema for all three
 * modes would have more nullable fields than the API allows (16), and it rejects the request with a 400.
 */
export function coachReplySchema(mode: CoachMode) {
  const field = PROPOSAL_FIELD[mode]
  return {
    type: 'object',
    additionalProperties: false,
    required: ['message', field],
    properties: {
      message: { type: 'string', description: 'What you say to the user. Plain text, short.' },
      [field]: PROPOSAL_SCHEMAS[field],
    },
  }
}
