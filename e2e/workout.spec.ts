import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { confirmSheet, freezeClock } from './helpers'

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` })

async function waitForLibrary(page: Page) {
  // The exercise library seeds into IndexedDB on first launch.
  await page.goto('/exercises')
  await expect.poll(async () => Number((await page.getByText(/^\d+ exercises$/).textContent())?.split(' ')[0])).toBeGreaterThan(500)
}

async function addPushPullLegsPlan(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plans' }).tap()
  await page.getByRole('button', { name: 'Use Push / Pull / Legs template' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Push / Pull / Legs' })).toBeVisible()
}

test('build a plan by hand with suggestions', async ({ page }) => {
  await waitForLibrary(page)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plans' }).tap()
  await page.getByRole('button', { name: 'New plan' }).tap()
  await page.getByLabel('Plan name').fill('My Split')
  await page.getByRole('button', { name: 'Create plan' }).tap()

  await page.getByRole('button', { name: 'Add day' }).first().tap()
  await page.getByRole('textbox', { name: 'New day' }).fill('Back & Biceps')
  await page.getByRole('button', { name: 'Save' }).tap()

  // Focus is inferred from the name, and suggestions follow it.
  const day = page.getByRole('region', { name: 'Back & Biceps' })
  await expect(day.getByText('Focus: Lats, Upper back, Biceps')).toBeVisible()
  await day.getByRole('button', { name: 'Add Pullups' }).tap()
  await expect(day.getByText('3 × 6–10 · rest 2:30')).toBeVisible()

  // Next suggestion fills a gap: a row, since there's no horizontal pull yet.
  await expect(day.getByRole('region', { name: 'Suggestions' }).getByText(/horizontal pull/).first()).toBeVisible()

  // Search the picker for something specific.
  await day.getByRole('button', { name: 'Add exercise' }).tap()
  const picker = page.getByRole('dialog', { name: 'Add to Back & Biceps' })
  await expect(picker.getByText('Suggested for Back & Biceps')).toBeVisible()
  await shot(page, 'plan-picker')
  await picker.getByRole('searchbox').fill('hammer curl')
  await picker.getByRole('button', { name: /^Hammer Curls/ }).tap()
  await expect(picker).toBeHidden()

  // Edit sets for the curls.
  await day.getByRole('button', { name: /Hammer Curls/ }).tap()
  await day.getByRole('button', { name: 'Increase Sets' }).tap()
  await expect(day.getByText('4 × 10–15')).toBeVisible()

  await expect(page.getByRole('region', { name: 'Weekly sets per muscle' })).toContainText('Nothing for chest')
  await shot(page, 'plan-builder')
})

test('log a workout: prefill, PRs, rest timer, summary', async ({ page }) => {
  await page.clock.install()
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)
  await shot(page, 'plan-template')

  // Workout 1: set a baseline on bench.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).tap()
  await expect(page.getByRole('region', { name: 'Up next' }).getByRole('heading', { name: 'Push', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start Push' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible()

  const bench = page.getByRole('region', { name: 'Barbell Bench Press - Medium Grip' })
  await expect(bench.getByText('No history yet')).toBeVisible()
  await bench.getByRole('textbox', { name: 'Set 1 weight', exact: true }).fill('80')
  await bench.getByRole('textbox', { name: 'Set 1 weight', exact: true }).press('Enter')
  await bench.getByRole('textbox', { name: 'Set 1 reps', exact: true }).fill('8')
  await bench.getByRole('textbox', { name: 'Set 1 reps', exact: true }).press('Enter')
  await bench.getByRole('button', { name: 'Complete set 1' }).tap()
  await freezeClock(page)

  // Rest timer starts with the plan's rest time and counts down.
  const timer = page.getByRole('timer', { name: 'Rest timer' })
  await expect(timer).toContainText(/2:(29|30)/)
  await page.clock.fastForward('01:00')
  await expect(timer).toContainText(/1:(29|30)/)
  await shot(page, 'workout-logging')
  await page.clock.fastForward('01:31')
  await expect(page.getByText('Rest over', { exact: true })).toBeVisible()
  await page.clock.resume() // let the rest of the app's timers run normally again

  // Only set 1 is ticked; finishing confirms the unticked ones get dropped.
  await page.getByRole('button', { name: 'Finish' }).tap()
  await confirmSheet(page, 'Finish')
  await expect(page.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible()
  await expect(page.getByText('Duration')).toBeVisible()
  await page.getByRole('link', { name: 'Done' }).tap()

  // Workout 2: sets are pre-filled from last time; a heavier set is a PR.
  await page.getByRole('button', { name: 'Start Push' }).tap()
  await expect(bench.getByText('Last time: 80kg × 8')).toBeVisible()
  await expect(bench.getByRole('textbox', { name: 'Set 1 weight', exact: true })).toHaveValue('80')
  await bench.getByRole('button', { name: 'Increase Set 1 weight' }).tap()
  await expect(bench.getByRole('textbox', { name: 'Set 1 weight', exact: true })).toHaveValue('82.5')
  await bench.getByRole('button', { name: 'Complete set 1' }).tap()
  await expect(page.getByRole('status').filter({ hasText: 'New PR' })).toContainText('Heaviest weight')
  await expect(bench.getByLabel('PR', { exact: true })).toBeVisible()
  await shot(page, 'workout-pr')

  await page.getByRole('button', { name: 'Finish' }).tap()
  await confirmSheet(page, 'Finish')
  await expect(page.getByRole('heading', { name: 'New PR' })).toBeVisible()
  await shot(page, 'workout-summary')

  // History and estimated 1RM on the exercise page.
  await page.getByRole('link', { name: 'Barbell Bench Press - Medium Grip' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Barbell Bench Press - Medium Grip' })).toBeVisible()
  const history = page.getByRole('region', { name: 'History' })
  await expect(page.locator('.stat-label', { hasText: 'Best est. 1RM' })).toBeVisible()
  await expect(history.getByText('82.5kg × 8', { exact: true })).toBeVisible()
  await expect(history.getByText('80kg × 8', { exact: true })).toBeVisible()
  await shot(page, 'exercise-history')
})

test('swap an exercise when the machine is taken', async ({ page }) => {
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)
  await page.getByRole('group', { name: 'Days' }).getByRole('button', { name: 'Legs', exact: true }).tap()
  await page.getByRole('button', { name: 'Start Legs' }).tap()

  await page.getByRole('button', { name: 'Options for Lying Leg Curls' }).tap()
  await page.getByRole('button', { name: 'Swap exercise' }).tap()
  const picker = page.getByRole('dialog', { name: 'Swap Lying Leg Curls' })
  await expect(picker.getByText('Works the same muscles')).toBeVisible()
  await shot(page, 'workout-swap')
  await picker.getByRole('button', { name: /^Seated Leg Curl/ }).first().tap()

  await expect(page.getByRole('region', { name: 'Seated Leg Curl' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Lying Leg Curls' })).toHaveCount(0)
})

test('a workout in progress survives a reload, and works offline', async ({ page, context }) => {
  await waitForLibrary(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).tap()
  await context.setOffline(true)

  await page.getByRole('button', { name: 'Start empty workout' }).tap()
  await page.getByRole('button', { name: 'Add exercise' }).tap()
  await page.getByRole('dialog').getByRole('searchbox').fill('barbell squat')
  await page.getByRole('dialog').getByRole('button', { name: /^Barbell Squat/ }).first().tap()
  const squat = page.getByRole('region', { name: 'Barbell Squat' })
  await squat.getByRole('textbox', { name: 'Set 1 weight', exact: true }).fill('100')
  await squat.getByRole('textbox', { name: 'Set 1 weight', exact: true }).press('Enter')
  await squat.getByRole('button', { name: 'Complete set 1' }).tap()
  await expect(page.getByRole('timer')).toBeVisible()

  await page.reload()
  await expect(squat.getByRole('button', { name: 'Undo set 1' })).toBeVisible()
  await expect(squat.getByRole('textbox', { name: 'Set 1 weight', exact: true })).toHaveValue('100')
  await expect(page.getByRole('timer')).toBeVisible()

  // Leaving the workout screen shows a resume card.
  await page.goto('/')
  await expect(page.getByText('Workout in progress')).toBeVisible()
  await page.getByRole('link', { name: /Resume/ }).tap()
  await expect(squat).toBeVisible()
})

test('kg/lb switch converts displayed weights', async ({ page }) => {
  await waitForLibrary(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start empty workout' }).tap()
  await page.getByRole('button', { name: 'Add exercise' }).tap()
  await page.getByRole('dialog').getByRole('searchbox').fill('barbell squat')
  await page.getByRole('dialog').getByRole('button', { name: /^Barbell Squat/ }).first().tap()
  const squat = page.getByRole('region', { name: 'Barbell Squat' })
  await squat.getByRole('textbox', { name: 'Set 1 weight', exact: true }).fill('100')
  await squat.getByRole('textbox', { name: 'Set 1 weight', exact: true }).press('Enter')
  // Saved once it has carried down to set 2; only then reload the page.
  await expect(squat.getByRole('textbox', { name: 'Set 2 weight', exact: true })).toHaveValue('100')

  await page.goto('/settings')
  await page.getByRole('radio', { name: 'lb' }).tap()
  // Wait for the setting to save before the full page load.
  await expect(page.getByRole('radio', { name: 'lb' })).toHaveAttribute('aria-checked', 'true')
  await page.goto('/workout')
  await expect(squat.getByRole('textbox', { name: 'Set 1 weight', exact: true })).toHaveValue('220.5')
  await squat.getByRole('button', { name: 'Increase Set 1 weight' }).tap()
  await expect(squat.getByRole('textbox', { name: 'Set 1 weight', exact: true })).toHaveValue('225.5')
})

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('workout screen is readable in dark mode', async ({ page }) => {
    await waitForLibrary(page)
    await addPushPullLegsPlan(page)
    await page.getByRole('button', { name: 'Start Push' }).tap()
    const bench = page.getByRole('region', { name: 'Barbell Bench Press - Medium Grip' })
    await bench.getByRole('textbox', { name: 'Set 1 weight', exact: true }).fill('60')
    await bench.getByRole('textbox', { name: 'Set 1 weight', exact: true }).press('Enter')
    await expect(bench.getByRole('textbox', { name: 'Set 3 weight', exact: true })).toHaveValue('60')
    await bench.getByRole('button', { name: 'Complete set 1' }).tap()
    await expect(page.getByRole('timer')).toBeVisible()
    await shot(page, 'dark-workout')
    await page.goto('/')
    await shot(page, 'dark-today')
  })
})
