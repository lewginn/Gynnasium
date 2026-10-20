import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessage, BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { describe, expect, it } from 'vitest'
import type { CoachReply } from '../src/lib/coachSchema.js'
import { MODEL, OPTIONS, buildParams, catalogueText, handleCoach, parseRequest, type CoachDeps } from './coach.js'

const reply: CoachReply = { message: 'Swapped the leg press for hack squats.', newPlan: null, changes: [], goalPlan: null }

function message(overrides: Partial<BetaMessage> = {}): BetaMessage {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{ type: 'text', text: JSON.stringify(reply), citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    ...overrides,
  } as BetaMessage
}

function deps(overrides: Partial<CoachDeps> = {}) {
  const calls: BetaMessageStreamParams[] = []
  const d: CoachDeps = {
    env: { ANTHROPIC_API_KEY: 'key', COACH_ALLOWED_EMAILS: 'lewis@example.com, Friend@Example.com' },
    catalogue: () => [
      { id: 'Barbell_Squat', equipment: 'barbell', primaryMuscles: ['quads'], logging: 'weight_reps' },
      { id: 'Plank', equipment: 'bodyweight', primaryMuscles: ['abs'], logging: 'time' },
    ],
    getUser: async (token) => (token === 'good' ? { email: 'lewis@example.com' } : token === 'friend' ? { email: 'friend@example.com' } : token === 'stranger' ? { email: 'x@y.z' } : null),
    callClaude: async (params) => {
      calls.push(params)
      return message()
    },
    ...overrides,
  }
  return { d, calls }
}

const body = { mode: 'edit', context: 'Plan: Legs\nd1 Legs\n  x1 Leg_Press', turns: [{ role: 'user', content: 'The leg press is taken' }] }
const post = (token: string | null, b: unknown = body) =>
  new Request('https://app.test/api/coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof b === 'string' ? b : JSON.stringify(b),
  })

describe('handleCoach', () => {
  it('answers a signed-in, allowed user with Claude’s structured reply', async () => {
    const { d, calls } = deps()
    const res = await handleCoach(post('good'), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(reply)
    expect(calls).toHaveLength(1)
  })

  it('matches allowed emails case-insensitively', async () => {
    const { d } = deps()
    expect((await handleCoach(post('friend'), d)).status).toBe(200)
  })

  it('refuses without a valid login, or for someone not on the list', async () => {
    const { d, calls } = deps()
    expect((await handleCoach(post(null), d)).status).toBe(401)
    expect((await handleCoach(post('expired'), d)).status).toBe(401)
    expect((await handleCoach(post('stranger'), d)).status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it('is off when there is no API key, and nobody is allowed when the list is empty', async () => {
    expect((await handleCoach(post('good'), deps({ env: { COACH_ALLOWED_EMAILS: 'lewis@example.com' } }).d)).status).toBe(503)
    expect((await handleCoach(post('good'), deps({ env: { ANTHROPIC_API_KEY: 'key' } }).d)).status).toBe(403)
  })

  it('rejects malformed requests before calling Claude', async () => {
    const { d, calls } = deps()
    expect((await handleCoach(post('good', '{not json'), d)).status).toBe(400)
    expect((await handleCoach(post('good', { ...body, mode: 'chat' }), d)).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('says so when Claude declines, is cut off, or returns something unreadable', async () => {
    const run = async (m: BetaMessage) => (await handleCoach(post('good'), deps({ callClaude: async () => m }).d)).status
    expect(await run(message({ stop_reason: 'refusal' }))).toBe(422)
    expect(await run(message({ stop_reason: 'max_tokens' }))).toBe(502)
    expect(await run(message({ content: [{ type: 'text', text: 'Sure! Here', citations: null }] }))).toBe(502)
  })

  it('maps API errors to messages the app can show', async () => {
    const rateLimited = new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 'slow down', new Headers())
    const res = await handleCoach(post('good'), deps({ callClaude: async () => Promise.reject(rateLimited) }).d)
    expect(res.status).toBe(429)
    expect(((await res.json()) as { error: string }).error).toMatch(/busy/)
  })
})

describe('parseRequest', () => {
  it('needs turns that alternate and end with the user', () => {
    expect(parseRequest({ ...body, turns: [] })).toBeTypeOf('string')
    expect(parseRequest({ ...body, turns: [{ role: 'assistant', content: 'hi' }] })).toBeTypeOf('string')
    expect(
      parseRequest({
        ...body,
        turns: [
          { role: 'user', content: 'a' },
          { role: 'assistant', content: 'b' },
        ],
      }),
    ).toBeTypeOf('string')
    expect(parseRequest({ ...body, turns: [{ role: 'user', content: 'x'.repeat(4001) }] })).toBeTypeOf('string')
    expect(parseRequest(body)).toEqual(body)
  })
})

describe('buildParams', () => {
  it('caches the instructions and catalogue, and puts the context on the latest turn only', () => {
    const turns = [
      { role: 'user' as const, content: 'Build me a plan' },
      { role: 'assistant' as const, content: '{"message":"How many days?"}' },
      { role: 'user' as const, content: 'Three' },
    ]
    const p = buildParams({ mode: 'build', context: 'Units: kg', turns }, 'Barbell_Squat | barbell | quads | w')
    expect(p.model).toBe('claude-opus-5-5')
    expect(p.fallbacks).toBe('default')
    expect(p.output_config?.format?.type).toBe('json_schema')
    const system = p.system as { text: string; cache_control?: unknown }[]
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(system[0].text).toContain('Barbell_Squat | barbell | quads | w')
    expect(system[0].text).not.toContain('Units: kg')
    expect(p.messages[0].content).toBe('Build me a plan')
    expect(p.messages[2].content).toMatch(/^<context>\nMode: build\nUnits: kg\n<\/context>\n\nThree$/)
  })

  // The API rejects a structured-output schema with more than 16 union-typed (nullable) fields or 24 optional ones
  // with a 400, before Claude sees the request.
  it.each(['build', 'edit', 'goal'] as const)('sends a %s schema within the API’s structured-output limits', (mode) => {
    const schema = buildParams({ mode, context: '', turns: [{ role: 'user', content: 'Hi' }] }, '').output_config?.format?.schema
    let unions = 0
    let optional = 0
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      const { properties, required } = node as { properties?: Record<string, { anyOf?: unknown; type?: unknown }>; required?: string[] }
      for (const [key, prop] of Object.entries(properties ?? {})) {
        if (prop.anyOf || Array.isArray(prop.type)) unions++
        if (!required?.includes(key)) optional++
      }
      Object.values(node).forEach(walk)
    }
    walk(schema)
    expect(unions).toBeLessThanOrEqual(16)
    expect(optional).toBeLessThanOrEqual(24)
  })
})

describe('mode replies', () => {
  it('fills in the other modes’ fields with null', async () => {
    const goalReply = { message: 'Which days can you train?', goalPlan: null }
    const { d } = deps({ callClaude: async () => message({ content: [{ type: 'text', text: JSON.stringify(goalReply), citations: null }] }) })
    const res = await handleCoach(post('good', { ...body, mode: 'goal' }), d)
    expect(await res.json()).toEqual({ ...goalReply, newPlan: null, changes: null })
  })
})

describe('catalogueText', () => {
  it('lists each exercise on one line, starring staples', () => {
    expect(
      catalogueText([
        { id: 'Barbell_Squat', equipment: 'barbell', primaryMuscles: ['quads', 'glutes'], logging: 'weight_reps' },
        { id: 'Plank_With_Twist', equipment: 'bodyweight', primaryMuscles: ['abs'], logging: 'time' },
      ]),
    ).toBe('*Barbell_Squat | barbell | quads,glutes | w\nPlank_With_Twist | bodyweight | abs | t')
  })
})

describe('CORS for the iPhone app', () => {
  it('allows the app’s origin, and nothing else', async () => {
    const from = (origin: string) => new Request('https://app.test/api/coach', { method: 'OPTIONS', headers: { origin } })
    expect(OPTIONS(from('capacitor://localhost')).headers.get('access-control-allow-origin')).toBe('capacitor://localhost')
    expect(OPTIONS(from('https://evil.example')).headers.get('access-control-allow-origin')).toBeNull()
    const req = new Request('https://app.test/api/coach', {
      method: 'POST',
      headers: { origin: 'capacitor://localhost', authorization: 'Bearer good', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const res = await handleCoach(req, deps().d)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('capacitor://localhost')
  })
})
