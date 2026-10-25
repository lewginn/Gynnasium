import type { Page } from '@playwright/test'
import type { CoachRequest } from '../src/lib/coachSchema'
import { expect, test } from './fixtures'
import { addPushPullLegsPlan, nav, shot, waitForLibrary } from './helpers'

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return key(d)
}
/** How the calendar labels a day, e.g. "Tue, Oct 20". */
const cellName = (page: Page, date: string) =>
  page.evaluate((date) => {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  }, date)

test('a goal: set it, plan to the date with Claude, see it on the calendar and Today', async ({ page }) => {
  const target = inDays(60)
  const calls: CoachRequest[] = []
  const day = (name: string) => ({
    name,
    week: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    focusMuscles: ['quads'],
    exercises: [{ exerciseId: 'Barbell_Squat', sets: 3, repMin: 5, repMax: 8, restSec: 150 }],
  })
  await page.route('**/api/coach', async (route) => {
    calls.push(route.request().postDataJSON())
    await route.fulfill({
      json: {
        message: 'Six weeks to build, then lean out to the date.',
        newPlan: null,
        changes: null,
        goalPlan: {
          phases: [
            { name: 'Build', startsOn: inDays(0), endsOn: inDays(29), focus: 'Strength first', plan: { name: 'Ibiza: build', goal: '', days: [day('Full body')] } },
            { name: 'Lean out', startsOn: inDays(30), endsOn: target, focus: 'Keep strength, lose fat', plan: { name: 'Ibiza: lean out', goal: '', days: [day('Circuit')] } },
          ],
          nutrition: { calories: 2300, proteinG: 160, note: 'Adjust after three weeks of weigh-ins.' },
        },
      },
    })
  })
  await waitForLibrary(page)
  await page.goto('/goal')

  // Set the goal.
  const form = page.getByRole('form', { name: 'Goal' })
  await form.getByLabel('Name').fill('Ibiza')
  await form.getByLabel('Date').fill(target)
  await form.getByLabel('Description').fill('Look lean on the beach')
  await form.getByLabel('Target value in kg').fill('78')
  await form.getByRole('button', { name: 'Add' }).tap()
  await form.getByLabel('Target', { exact: true }).selectOption('lift')
  await form.getByLabel('Target value in kg').fill('100')
  await form.getByRole('button', { name: 'Add' }).tap()
  await expect(form.getByText('Bodyweight: 78kg')).toBeVisible()
  await shot(page, 'p5-goal-form')
  await form.getByRole('button', { name: 'Set goal' }).tap()

  await expect(page.getByRole('heading', { level: 1, name: 'Ibiza' })).toBeVisible()
  await expect(page.getByText('60 days to go')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Targets' })).toContainText('Nothing logged yet')

  // Plan to the date.
  await page.getByRole('link', { name: 'Plan with Claude' }).tap()
  await page.getByRole('button', { name: 'Build me a plan to the date' }).tap()
  const proposal = page.getByRole('region', { name: 'Proposed plan to your goal' })
  await expect(proposal).toContainText('Build')
  await expect(proposal).toContainText('Lean out')
  await expect(proposal).toContainText('2,300 kcal and 160 g protein a day')
  await shot(page, 'p5-goal-coach')
  expect(calls[0].mode).toBe('goal')
  expect(calls[0].context).toContain(`Goal: "Ibiza" on ${target}: 60 days`)
  expect(calls[0].context).toContain('Bodyweight: now not logged, target 78kg')
  await proposal.getByRole('button', { name: 'Apply plan' }).tap()
  await expect(proposal.getByRole('status')).toContainText('Applied')

  // The calendar: today has the Build phase's workout; mark it as a day off.
  await proposal.getByRole('button', { name: 'Open calendar' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible()
  const today = page.getByRole('gridcell', { name: new RegExp(`^${await cellName(page, inDays(0))}, Full body`) })
  await expect(today).toBeVisible()
  await shot(page, 'p5-calendar')
  await today.tap()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('button', { name: 'Start Full body' })).toBeVisible()
  await sheet.getByRole('checkbox', { name: /Day off/ }).tap()
  await expect(sheet.getByText('(skipped: day off)')).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).tap()
  await expect(page.getByRole('gridcell', { name: new RegExp(`^${await cellName(page, inDays(0))}, day off`) })).toBeVisible()

  // Today: it's a day off, so the hero offers the next workout; the goal shows its countdown and phase.
  await nav(page, 'Today')
  const hero = page.getByRole('region', { name: 'Up next' })
  await expect(hero).toContainText('Day off · next')
  await expect(hero.getByRole('heading', { name: 'Full body' })).toBeVisible()
  const goalCard = page.getByRole('link', { name: 'Goal: Ibiza' })
  await expect(goalCard).toContainText('60 days to go')
  await expect(goalCard).toContainText('Phase: Build')
  await shot(page, 'p5-today-goal')

  // The goal page lists the phases and food.
  await goalCard.tap()
  await expect(page.getByRole('link', { name: /Build.*Now/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Food' })).toContainText('2,300 kcal')
  await shot(page, 'p5-goal')
})

test('weekly schedule: put plan days on weekdays and see them on the calendar', async ({ page }) => {
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)
  const schedule = page.getByRole('region', { name: 'Weekly schedule' })
  await schedule.getByLabel('Monday').selectOption({ label: 'Push' })
  await schedule.getByLabel('Wednesday').selectOption({ label: 'Pull' })
  await schedule.getByLabel('Friday').selectOption({ label: 'Legs' })
  await expect(schedule.getByLabel('Monday')).toHaveValue(/.+/)
  await shot(page, 'p5-weekly-schedule')

  // Next Monday, Wednesday and Friday show Push, Pull and Legs.
  const next = (weekday: number) => inDays(((weekday - ((new Date().getDay() + 6) % 7) + 7) % 7) || 7)
  await schedule.getByRole('link', { name: 'Calendar' }).tap()
  for (const [weekday, name] of [
    [0, 'Push'],
    [2, 'Pull'],
    [4, 'Legs'],
  ] as const) {
    const date = next(weekday)
    if (date.slice(0, 7) !== inDays(0).slice(0, 7)) await page.getByRole('button', { name: 'Next month' }).tap()
    await expect(page.getByRole('gridcell', { name: `${await cellName(page, date)}, ${name}` })).toBeVisible()
    if (date.slice(0, 7) !== inDays(0).slice(0, 7)) await page.getByRole('button', { name: 'Previous month' }).tap()
  }
})

test('deleting a goal clears its coach chat', async ({ page }) => {
  await page.route('**/api/coach', (route) =>
    route.fulfill({ json: { message: 'Which days can you train?', newPlan: null, changes: null, goalPlan: null } }),
  )
  const setGoal = async (name: string) => {
    const form = page.getByRole('form', { name: 'Goal' })
    await form.getByLabel('Name').fill(name)
    await form.getByLabel('Date').fill(inDays(60))
    await form.getByRole('button', { name: 'Set goal' }).tap()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  }
  await page.goto('/goal')
  await setGoal('Ibiza')
  await page.getByRole('link', { name: 'Plan with Claude' }).tap()
  await page.getByRole('button', { name: 'Build me a plan to the date' }).tap()
  await expect(page.getByText('Which days can you train?')).toBeVisible()

  await page.getByRole('link', { name: 'Goal' }).tap()
  await page.getByRole('button', { name: 'Delete goal' }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete goal' }).tap()
  // The page goes to Today once the delete is saved; reloading before then would still show the goal.
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/goal')
  await setGoal('Marathon')
  await page.getByRole('link', { name: 'Plan with Claude' }).tap()
  await expect(page.getByRole('button', { name: 'Build me a plan to the date' })).toBeVisible()
  await expect(page.getByText('Which days can you train?')).toHaveCount(0)
})
