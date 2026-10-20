import type { Page, Route } from '@playwright/test'
import type { CoachReply, CoachRequest, PlanChange } from '../src/lib/coachSchema'
import { expect, test } from './fixtures'
import { addPushPullLegsPlan, nav, shot, waitForLibrary } from './helpers'

// The coach's server (/api/coach) is answered here, so these check the app's side: what it sends,
// how it previews Claude's proposal, and that nothing changes until Apply.

interface Call {
  body: CoachRequest
  auth: string | null
}

type Reply = Omit<CoachReply, 'goalPlan'> & Partial<Pick<CoachReply, 'goalPlan'>>

export async function mockCoach(page: Page, replies: (Reply | { status: number; error: string })[]) {
  const calls: Call[] = []
  await page.route('**/api/coach', async (route: Route) => {
    calls.push({ body: route.request().postDataJSON(), auth: route.request().headers()['authorization'] ?? null })
    const next = replies.shift()
    if (!next) return route.fulfill({ status: 500, json: { error: 'No more replies' } })
    if ('error' in next) return route.fulfill({ status: next.status, json: { error: next.error } })
    return route.fulfill({ status: 200, json: { goalPlan: null, ...next } })
  })
  return calls
}

const change = (c: Partial<PlanChange> & Pick<PlanChange, 'op'>): PlanChange => ({
  day: null,
  exercise: null,
  exerciseId: null,
  name: null,
  sets: null,
  repMin: null,
  repMax: null,
  restSec: null,
  position: null,
  exercises: null,
  week: null,
  reason: '',
  ...c,
})

test('build a plan with Claude: preview, then create', async ({ page }) => {
  const calls = await mockCoach(page, [
    {
      message: 'Here’s a 3-day full-body plan. I assumed a full gym.',
      changes: null,
      newPlan: {
        name: 'Full body ×3',
        goal: 'Build muscle on three days a week',
        days: [
          {
            name: 'Day A',
            week: null,
            weekdays: null,
            focusMuscles: ['quads', 'chest', 'lats'],
            exercises: [
              { exerciseId: 'Barbell_Squat', sets: 4, repMin: 6, repMax: 8, restSec: 180 },
              { exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', sets: 3, repMin: 6, repMax: 10, restSec: 150 },
              { exerciseId: 'Not_A_Real_Exercise', sets: 3, repMin: 8, repMax: 12, restSec: 90 },
            ],
          },
          { name: 'Day B', week: null, weekdays: null, focusMuscles: ['hamstrings'], exercises: [{ exerciseId: 'Romanian_Deadlift', sets: 3, repMin: 8, repMax: 10, restSec: 150 }] },
        ],
      },
    },
  ])
  await waitForLibrary(page)
  await nav(page, 'Plans')
  await page.getByRole('link', { name: 'Build a plan with Claude' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Build a plan' })).toBeVisible()
  await page.getByRole('button', { name: '3 days a week, full gym, build muscle' }).tap()

  const proposal = page.getByRole('region', { name: 'Proposed plan: Full body ×3' })
  await expect(proposal).toBeVisible()
  await expect(proposal).toContainText('Barbell Squat')
  await expect(proposal).toContainText('4 × 6–8, rest 3 min')
  await expect(proposal).toContainText('Left out 1 suggestion')
  await shot(page, 'p3-coach-build')

  // Nothing is saved until you say so.
  await nav(page, 'Plans')
  await expect(page.getByRole('link', { name: /Full body/ })).toHaveCount(0)
  await page.goBack()

  await page.getByRole('button', { name: 'Create plan' }).tap()
  await expect(page.getByText('Plan created')).toBeVisible()
  await page.getByRole('button', { name: 'Open plan' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Full body ×3' })).toBeVisible()
  await expect(page.getByText('Barbell Squat')).toBeVisible()

  expect(calls).toHaveLength(1)
  expect(calls[0].auth).toMatch(/^Bearer .+/)
  expect(calls[0].body).toMatchObject({ mode: 'build', turns: [{ role: 'user', content: '3 days a week, full gym, build muscle' }] })
  expect(calls[0].body.context).toContain('Units: kg')
})

test('ask Claude to change a plan: swap when a machine is taken', async ({ page }) => {
  const calls = await mockCoach(page, [
    {
      message: 'Dumbbell bench hits the same muscles. I’ve kept your sets and reps.',
      newPlan: null,
      changes: [
        change({ op: 'replace_exercise', exercise: 'x1', exerciseId: 'Dumbbell_Bench_Press', reason: 'Bench is taken' }),
        change({ op: 'update_exercise', exercise: 'x2', sets: 4 }),
        change({ op: 'remove_exercise', exercise: 'x99' }), // doesn't exist: left out
      ],
    },
    { message: 'Sounds good. Anything else?', newPlan: null, changes: null },
  ])
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)
  await page.getByRole('link', { name: 'Ask Claude' }).tap()
  await page.getByLabel('Message Claude').fill('The bench is taken')
  await page.getByRole('button', { name: 'Send' }).tap()

  const proposal = page.getByRole('region', { name: 'Proposed changes' })
  await expect(proposal).toContainText('Barbell Bench Press - Medium Grip → Dumbbell Bench Press')
  await expect(proposal).toContainText('In Push · Bench is taken')
  await expect(proposal).toContainText('3 → 4 sets')
  await expect(proposal).toContainText('Left out 1 suggestion')
  await shot(page, 'p3-coach-edit')

  expect(calls[0].body.mode).toBe('edit')
  expect(calls[0].body.context).toContain('x1 Barbell_Bench_Press_-_Medium_Grip')

  await proposal.getByRole('button', { name: 'Apply 2 changes' }).tap()
  await expect(proposal.getByRole('status')).toContainText('Applied')

  // A follow-up carries what happened and the updated plan.
  await page.getByLabel('Message Claude').fill('Thanks')
  await page.getByLabel('Message Claude').press('Enter')
  await expect(page.getByText('Sounds good. Anything else?')).toBeVisible()
  expect(calls[1].body.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user'])
  expect(calls[1].body.turns[1].content).toContain('the user applied it')
  expect(calls[1].body.context).toContain('x1 Dumbbell_Bench_Press')

  await page.getByRole('link', { name: 'Push / Pull / Legs' }).tap()
  await expect(page.getByRole('button', { name: /^Dumbbell Bench Press 4 × 5–8/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Incline Dumbbell Press 4 ×/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Barbell Bench Press - Medium Grip \d/ })).toHaveCount(0)
})

test('the coach says what went wrong and keeps your message', async ({ page, context }) => {
  await mockCoach(page, [
    { status: 403, error: 'Your account can’t use the coach yet.' },
    { message: 'Hi', newPlan: null, changes: null },
  ])
  await page.goto('/coach')
  await page.getByLabel('Message Claude').fill('Make me a plan')
  await page.getByRole('button', { name: 'Send' }).tap()
  await expect(page.getByRole('alert')).toContainText('Your account can’t use the coach yet.')
  await expect(page.getByLabel('Message Claude')).toHaveValue('Make me a plan')

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Send' }).tap()
  await expect(page.getByRole('alert')).toContainText('You’re offline')
  await context.setOffline(false)

  await page.getByRole('button', { name: 'Send' }).tap()
  await expect(page.getByText('Hi', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('the message box grows with the text and counts characters up to the limit', async ({ page }) => {
  await page.goto('/coach')
  const input = page.getByLabel('Message Claude')
  await expect(page.getByText('0 / 4,000')).toBeVisible()
  const empty = (await input.boundingBox())!.height

  const text = 'I can train Monday, Wednesday and Friday.\nAbout an hour each time.\nFull gym.\nI want to lose 5 kg by June.'
  await input.fill(text)
  await expect(page.getByText(`${text.length} / 4,000`)).toBeVisible()
  expect((await input.boundingBox())!.height).toBeGreaterThan(empty)
  await shot(page, 'p3-coach-composer')

  await input.fill('x'.repeat(4100))
  await expect(input).toHaveValue('x'.repeat(4000))
  await expect(page.getByText('4,000 / 4,000')).toBeVisible()
})

test('“Not now” leaves the plan as it was', async ({ page }) => {
  await mockCoach(page, [{ message: 'Swap it?', newPlan: null, changes: [change({ op: 'remove_exercise', exercise: 'x1' })] }])
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)
  await page.getByRole('link', { name: 'Ask Claude' }).tap()
  await page.getByRole('button', { name: 'More arm work' }).tap()
  await page.getByRole('button', { name: 'Not now' }).tap()
  await expect(page.getByText('Not applied.')).toBeVisible()
  await page.getByRole('link', { name: 'Push / Pull / Legs' }).tap()
  await expect(page.getByRole('button', { name: /^Barbell Bench Press - Medium Grip \d/ })).toBeVisible()
})
