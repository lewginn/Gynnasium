// POST /api/coach: one turn of the plan coach. Runs on Vercel, so the Anthropic key never reaches the phone.
// The app sends the chat and a text snapshot of the plan; Claude replies with a message and, optionally,
// a proposed plan or a list of changes, which the app previews and the user approves (or not).
import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessage, BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COACH_REPLY_SCHEMA, type CoachReply, type CoachRequest } from '../src/lib/coachSchema.js'
import { POPULAR_EXERCISE_IDS } from '../src/lib/popular.js'

export const MODEL = 'claude-opus-5-5'

const LIMITS = { turns: 40, turnChars: 4000, contextChars: 30_000 }

interface CatalogueExercise {
  id: string
  equipment: string
  primaryMuscles: string[]
  logging: 'weight_reps' | 'bodyweight' | 'time'
}

export interface CoachEnv {
  ANTHROPIC_API_KEY?: string
  /** Comma-separated emails allowed to use the coach (it spends the owner's API credit). */
  COACH_ALLOWED_EMAILS?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export interface CoachDeps {
  env: CoachEnv
  catalogue: () => CatalogueExercise[]
  /** The signed-in user for a Supabase access token, or null if the token isn't valid. */
  getUser: (token: string) => Promise<{ email: string } | null>
  callClaude: (params: BetaMessageStreamParams) => Promise<BetaMessage>
}

const LOGGING_CODE = { weight_reps: 'w', bodyweight: 'b', time: 't' } as const

export function catalogueText(exercises: CatalogueExercise[]): string {
  const popular = new Set(POPULAR_EXERCISE_IDS)
  return exercises
    .map((e) => `${popular.has(e.id) ? '*' : ''}${e.id} | ${e.equipment} | ${e.primaryMuscles.join(',')} | ${LOGGING_CODE[e.logging]}`)
    .join('\n')
}

const INSTRUCTIONS = `You are the coach inside Gynnasium, a gym-tracking app. You help one person build and adjust their training plans.

You never change anything yourself: you propose, the app shows the person a preview, and they decide whether to apply it.

Three modes, given in the context:
- build: help them make a new plan. When you know enough to write a good one (goal, days per week, equipment, experience; time per session and injuries if relevant), put the whole plan in newPlan. If something essential is missing, ask one short question and leave newPlan null. Don't interrogate: assume sensibly and say what you assumed.
- edit: the context shows their current plan, with refs for days (d1, d2…) and exercises (x1, x2…). Put edits in changes, using those refs. Make only the edits they asked for, plus anything those edits require.
- goal: they're training towards a date (a holiday, an event). Put a plan in goalPlan: phases back to back from today to the goal date, each with its own plan, plus daily nutrition targets. Leave newPlan and changes null.

Planning to a goal:
- Before proposing, you need the days of the week they can train (and how long per session, and equipment, if not already clear). For nutrition you need sex, age, height and activity outside the gym; bodyweight is in the context. Ask for anything missing in one short message, with goalPlan null.
- Split the time into phases suited to the goal and the time available: e.g. build, then lean out, then an easier final week before the date. Under four weeks, use one phase. Each phase is 3–12 weeks except a short final one.
- Every day in every phase gets weekdays (0 = Monday … 6 = Sunday) on the days they can train, with no two days on the same weekday (unless they use weeks A and B). Days off listed in the context are skipped automatically; don't plan around single dates.
- Nutrition: a modest deficit (about 300–500 kcal under maintenance) to lose fat, maintenance or a small surplus to build. Protein about 1.6–2.2 g per kg of bodyweight. Give whole numbers. Say it's an estimate to adjust after two or three weeks of weigh-ins. Never go below about 1,500 kcal for men or 1,200 for women.
- If a target isn't realistic by the date, say so plainly and plan for a sensible part of it.

Exercises:
- Use only ids from the catalogue below, copied exactly. Prefer ids marked * (common gym staples) unless asked otherwise.
- Match the equipment they have. If a machine is taken or missing, swap in something that trains the same muscles with what's available.
- Timed exercises (t) use seconds for repMin/repMax.
- Sensible defaults: compounds 5–10 reps with 2–3 min rest; isolation 8–15 reps with 60–90 s rest; 2–5 sets per exercise; about 10–20 working sets per muscle per week for muscle growth. 4–7 exercises per day.

Change ops (fields an op doesn't use are null):
- add_exercise: day, exerciseId, sets, repMin, repMax, restSec, position (1-based; null = at the end)
- remove_exercise: exercise
- replace_exercise: exercise, exerciseId; sets/repMin/repMax/restSec only if they should change
- update_exercise: exercise, plus any of sets, repMin, repMax, restSec
- move_exercise: exercise, position
- add_day: name, exercises
- remove_day: day
- rename_day: day, name
- rename_plan: name
- set_day_week: day, week (1 = week A, 2 = week B, null = every week)
add_day also takes week.

Alternating weeks: when someone wants week A and week B to differ, give every day a week (1 or 2). The app runs week A's days in order, then week B's, then repeats. Otherwise leave week null on every day.

Writing the message:
- Short and plain, like a good coach talking between sets. No markdown, headings or exclamation marks. Don't repeat the changes one by one: the app lists them.
- Use the person's units for any weight you mention.
- If they ask about something other than their training, answer briefly with newPlan and changes null.
- You're not a doctor. For pain or injury, suggest seeing a professional and avoid loading the area.

Exercise catalogue: id | equipment | primary muscles | logging (w = weight × reps, b = bodyweight reps, t = timed). * = common staple.`

export function buildParams(req: CoachRequest, catalogue: string): BetaMessageStreamParams {
  const last = req.turns.length - 1
  return {
    model: MODEL,
    max_tokens: 32_000,
    betas: ['server-side-fallback-2026-07-01'],
    // If Claude Opus declines, Anthropic retries on its recommended fallback model.
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: COACH_REPLY_SCHEMA } },
    // Instructions and catalogue never change between requests, so they're cached.
    system: [{ type: 'text', text: `${INSTRUCTIONS}\n\n${catalogue}`, cache_control: { type: 'ephemeral' } }],
    messages: req.turns.map((t, i) => ({
      role: t.role,
      content: i === last ? `<context>\nMode: ${req.mode}\n${req.context}\n</context>\n\n${t.content}` : t.content,
    })),
  }
}

export function parseRequest(body: unknown): CoachRequest | string {
  if (!body || typeof body !== 'object') return 'Expected a JSON body.'
  const { mode, turns, context } = body as Record<string, unknown>
  if (mode !== 'build' && mode !== 'edit' && mode !== 'goal') return 'mode must be build, edit or goal.'
  if (typeof context !== 'string' || context.length > LIMITS.contextChars) return 'context must be a string.'
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > LIMITS.turns) return `turns must have 1–${LIMITS.turns} entries.`
  for (const [i, t] of turns.entries()) {
    if (!t || typeof t !== 'object') return 'Each turn must be an object.'
    const { role, content } = t as Record<string, unknown>
    if (role !== (i % 2 === 0 ? 'user' : 'assistant')) return 'Turns must alternate, starting with the user.'
    if (typeof content !== 'string' || !content.trim() || content.length > LIMITS.turnChars) return 'Each turn needs some text (up to 4000 characters).'
  }
  if (turns.length % 2 === 0) return 'The last turn must be the user’s.'
  return { mode, turns: turns as CoachRequest['turns'], context }
}

/** The iPhone app's web view runs on its own origin, so it needs CORS. The bearer token is the access control. */
const APP_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost'])

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!origin || !APP_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export async function handleCoach(request: Request, deps: CoachDeps): Promise<Response> {
  const cors = corsHeaders(request)
  const json = (status: number, body: unknown) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...cors } })
  const fail = (status: number, error: string) => json(status, { error })
  const { env } = deps
  if (!env.ANTHROPIC_API_KEY) return fail(503, 'The coach isn’t switched on: there’s no Anthropic API key on the server.')

  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
  const user = token ? await deps.getUser(token) : null
  if (!user) return fail(401, 'Sign in again to use the coach.')
  const allowed = (env.COACH_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (!allowed.includes(user.email.toLowerCase())) return fail(403, 'Your account can’t use the coach yet.')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail(400, 'Expected a JSON body.')
  }
  const req = parseRequest(body)
  if (typeof req === 'string') return fail(400, req)

  let message: BetaMessage
  try {
    message = await deps.callClaude(buildParams(req, catalogueText(deps.catalogue())))
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return fail(429, 'Claude is busy. Try again in a minute.')
    if (error instanceof Anthropic.AuthenticationError) return fail(503, 'The coach’s Anthropic API key isn’t working.')
    if (error instanceof Anthropic.APIError) return fail(502, `Claude couldn’t answer (${error.status ?? 'network'}). Try again.`)
    throw error
  }

  if (message.stop_reason === 'refusal') return fail(422, 'Claude couldn’t help with that one. Try putting it another way.')
  if (message.stop_reason === 'max_tokens') return fail(502, 'Claude’s answer was cut off. Try asking for less at once.')
  const text = message.content.find((b) => b.type === 'text')?.text
  try {
    return json(200, JSON.parse(text ?? '') as CoachReply)
  } catch {
    return fail(502, 'Claude’s answer didn’t come through properly. Try again.')
  }
}

// ---------------------------------------------------------------- Vercel entry point

let cachedCatalogue: CatalogueExercise[] | null = null

const liveDeps = (): CoachDeps => ({
  env: process.env,
  catalogue: () =>
    (cachedCatalogue ??= JSON.parse(readFileSync(join(process.cwd(), 'src/data/exercises.json'), 'utf8')) as CatalogueExercise[]),
  getUser: async (token) => {
    const url = process.env.VITE_SUPABASE_URL
    const key = process.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) return null
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const user = (await res.json()) as { email?: string }
    return user.email ? { email: user.email } : null
  },
  callClaude: (params) => new Anthropic().beta.messages.stream(params).finalMessage(),
})

export function POST(request: Request): Promise<Response> {
  return handleCoach(request, liveDeps())
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}
