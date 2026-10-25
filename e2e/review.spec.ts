import type { CoachRequest } from '../src/lib/coachSchema'
import { expect, test } from './fixtures'
import { addPushPullLegsPlan, exerciseCard, finishWorkout, nav, setInput, shot, typeInto, waitForLibrary } from './helpers'

const BENCH = 'Barbell Bench Press - Medium Grip'
const PRESS = 'Dumbbell Shoulder Press'
const PROMPT = 'Review last week and suggest changes to my plan'
const DAY = 86_400_000

/** One set each of the given exercises, at the weight and reps given. */
async function pushWorkout(page: import('@playwright/test').Page, sets: [string, string, string][]) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start Push' }).tap()
  for (const [name, kg, reps] of sets) {
    const card = exerciseCard(page, name)
    await typeInto(setInput(card, 1, 'weight'), kg)
    await typeInto(setInput(card, 1, 'reps'), reps)
    await card.getByRole('button', { name: 'Complete set 1' }).tap()
  }
  await finishWorkout(page)
}

test('weekly review: on Progress, a row on Today early in the week, and Ask Claude only sends on Send', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const calls: CoachRequest[] = []
  await page.route('**/api/coach', async (route) => {
    calls.push(route.request().postDataJSON())
    await route.fulfill({ json: { message: 'Add a rep to the bench before adding weight.', newPlan: null, changes: null, goalPlan: null } })
  })

  // Friday 16 October, then Monday 19 and Wednesday 21: the bench stays at 80kg × 6, the press goes up.
  await page.clock.install({ time: new Date(2026, 9, 16, 18) })
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)
  await pushWorkout(page, [[BENCH, '80', '6']])
  await page.clock.fastForward(3 * DAY)
  await pushWorkout(page, [
    [BENCH, '80', '6'],
    [PRESS, '20', '8'],
  ])
  await page.clock.fastForward(2 * DAY)
  await pushWorkout(page, [
    [BENCH, '80', '6'],
    [PRESS, '22', '8'],
  ])

  // Monday 26 October: Today offers last week's review, just under This week, with Start still in view.
  await page.clock.fastForward(5 * DAY)
  await page.goto('/')
  const row = page.getByRole('link', { name: /Last week’s review/ })
  await expect(row).toContainText('2 of 3 workouts · 1 PR')
  await expect(page.locator('section.week + ul.list')).toContainText('Last week’s review')
  await expect(page.getByRole('region', { name: 'Up next' }).getByRole('button', { name: /^Start / })).toBeInViewport()
  await shot(page, 'weekly-review-today')
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' })) // clear of the tab bar
  await shot(page, 'weekly-review-today-row')

  await row.tap()
  const review = page.getByRole('region', { name: 'Last week' })
  await expect(review).toContainText('Workouts2 / 3')
  await expect(review).toContainText('Working sets4 / 32') // two Push days of 16 sets
  await expect(review).toContainText('PRs1')
  const prs = review.getByRole('list', { name: 'Last week’s PRs' })
  await expect(prs).toContainText(PRESS)
  await expect(prs).toContainText('22kg × 8')
  await expect(prs).toContainText('Heaviest weight')
  const stalled = review.getByRole('list', { name: 'Stalled lifts' })
  await expect(stalled).toContainText(BENCH)
  await expect(stalled).toContainText('No better than 80kg × 6 in 3 workouts')
  await expect(stalled).toContainText('Same weight, aim for one more rep per set (up to 8).') // what the workout suggests
  const low = review.getByRole('list', { name: 'Muscles under 10 sets' })
  await expect(low.getByRole('listitem').filter({ hasText: 'Chest' })).toContainText('2 sets')
  await expect(low.getByRole('listitem').filter({ hasText: 'No sets' })).toContainText('Quads') // Legs wasn't done
  await shot(page, 'weekly-review-progress')
  await page.screenshot({ path: 'test-results/screens/weekly-review-progress-full.png', fullPage: true })

  // Ask Claude: the coach opens with the message ready, and nothing is sent until Send.
  await review.getByRole('link', { name: 'Ask Claude' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Claude' })).toBeVisible()
  await expect(page.getByLabel('Message Claude')).toHaveValue(PROMPT)
  await page.waitForTimeout(1000)
  expect(calls).toHaveLength(0)
  await shot(page, 'weekly-review-coach')

  await page.getByRole('button', { name: 'Send' }).tap()
  await expect(page.getByText('Add a rep to the bench before adding weight.')).toBeVisible()
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({ mode: 'edit', turns: [{ role: 'user', content: PROMPT }] })
  expect(calls[0].context).toContain('Current plan: "Push / Pull / Legs"')
  expect(calls[0].context).toContain("Last week's review (2026-10-19 to 2026-10-25)")
  expect(calls[0].context).toContain('Barbell_Bench_Press_-_Medium_Grip: stuck at 80kg × 6')

  // From Thursday, Today no longer offers it; Progress still has it.
  await page.clock.setSystemTime(new Date(2026, 9, 29, 9))
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'This week' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Last week’s review/ })).toHaveCount(0)
  await nav(page, 'Progress')
  await expect(page.getByRole('region', { name: 'Last week' })).toBeVisible()
})
