import { expect, test, type Page } from '@playwright/test'

const BENCH = 'Barbell Bench Press - Medium Grip'

async function addBench(page: Page) {
  await page.getByRole('link', { name: 'Add exercise' }).tap()
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('barbell bench press medium')
  await page.getByRole('button', { name: `Add ${BENCH}` }).tap()
  await expect(page.getByRole('heading', { name: BENCH })).toBeVisible()
}

test('logs a workout in a few taps, then flags a PR next time', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start workout' }).tap()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0) // full-screen while training
  await expect(page.getByText('Add your first exercise')).toBeVisible()

  await addBench(page)
  // A new barbell exercise starts at the empty bar.
  const weight = page.getByRole('textbox', { name: 'Weight' })
  await expect(weight).toHaveValue('20')
  await weight.fill('60')
  await page.getByRole('button', { name: 'Increase Reps' }).tap()
  await expect(page.getByRole('textbox', { name: 'Reps' })).toHaveValue('9')
  await page.screenshot({ path: 'test-results/screens/workout-focus.png' })

  await page.getByRole('button', { name: 'Log set' }).tap()
  await expect(page.getByRole('button', { name: 'Edit set 1' })).toContainText('60')
  // Rest starts on its own; the next set is pre-filled with what was just done.
  await expect(page.getByRole('timer', { name: 'Rest timer' })).toBeVisible()
  await expect(weight).toHaveValue('60')
  await page.getByRole('button', { name: 'Log set' }).tap()
  await expect(page.getByRole('button', { name: 'Edit set 2' })).toBeVisible()
  await page.screenshot({ path: 'test-results/screens/workout-logging.png' })

  // Minimise: the workout docks above the tab bar.
  await page.getByRole('link', { name: 'Minimise workout' }).tap()
  await expect(page.getByRole('link', { name: /^Resume (Morning|Afternoon|Evening) workout$/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/screens/workout-docked.png' })
  await page.getByRole('link', { name: /^Resume (Morning|Afternoon|Evening) workout$/ }).tap()

  await page.getByRole('button', { name: 'Finish' }).tap()
  await page.getByRole('button', { name: 'Finish workout' }).tap()
  await expect(page.getByText('Workout complete')).toBeVisible()
  await expect(page.locator('.stat-grid')).toContainText('Sets2')
  await page.getByRole('link', { name: 'Done' }).tap()
  await expect(page.getByText('Recent workouts')).toBeVisible()

  // Second session: pre-filled from last time, and beating it is a PR.
  await page.getByRole('button', { name: 'Start workout' }).tap()
  await page.getByRole('link', { name: 'Add exercise' }).tap()
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible()
  await page.getByRole('button', { name: `Add ${BENCH}` }).first().tap()
  await expect(weight).toHaveValue('60')
  await expect(page.getByText('Last time')).toContainText('60 kg × 9')
  await page.getByRole('button', { name: 'Increase Weight' }).tap()
  await expect(weight).toHaveValue('62.5')
  await page.getByRole('button', { name: 'Log set' }).tap()

  await expect(page.getByRole('status')).toContainText('New PR')
  await expect(page.getByRole('button', { name: 'Edit set 1' })).toContainText('PR')
  // Going up on set 1 carries through to set 2.
  await expect(weight).toHaveValue('62.5')
  await page.screenshot({ path: 'test-results/screens/workout-pr.png' })
})

test('edits and deletes a logged set', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start workout' }).tap()
  await addBench(page)
  await page.getByRole('button', { name: 'Log set' }).tap()
  await page.getByRole('button', { name: 'Edit set 1' }).tap()
  await page.getByRole('textbox', { name: 'Reps' }).fill('5')
  await page.getByRole('button', { name: 'Save' }).tap()
  await expect(page.getByRole('button', { name: 'Edit set 1' })).toContainText('5')

  await page.getByRole('button', { name: 'Edit set 1' }).tap()
  await page.getByRole('button', { name: 'Delete' }).tap()
  await expect(page.getByRole('button', { name: 'Edit set 1' })).toHaveCount(0)

  // With nothing logged, finishing only offers to discard.
  await page.getByRole('button', { name: 'Finish' }).tap()
  await expect(page.getByText('No sets logged yet')).toBeVisible()
  await page.getByRole('button', { name: 'Discard workout' }).tap()
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible()
})

test('rest timer counts down and can be adjusted or skipped', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start workout' }).tap()
  await addBench(page)
  await page.getByRole('button', { name: 'Log set' }).tap()
  const timer = page.getByRole('timer', { name: 'Rest timer' })
  await expect(timer).toContainText('2:') // bench rests 2:30
  await page.getByRole('button', { name: '15 seconds more' }).tap()
  await expect(timer).toContainText(/2:4\d/)
  await page.screenshot({ path: 'test-results/screens/workout-rest.png' })
  await page.getByRole('button', { name: 'Skip' }).tap()
  await expect(timer).toHaveCount(0)
})
