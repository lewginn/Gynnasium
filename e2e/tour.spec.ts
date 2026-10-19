import { expect, test } from '@playwright/test'
import { addPushPullLegsPlan, exerciseCard, finishWorkout, freezeClock, nav, setInput, typeInto, waitForLibrary } from './helpers'

// Walks through every screen in dark mode and saves numbered screenshots to test-results/tour/,
// so the whole app can be reviewed at a glance without a phone.
test.use({ colorScheme: 'dark' })

test('screen tour', async ({ page }) => {
  test.setTimeout(90_000) // walks every screen; slow under parallel load
  let n = 0
  const snap = async (name: string) => {
    await page.waitForTimeout(350) // let sheets and banners finish animating in
    await page.screenshot({ path: `test-results/tour/${String(++n).padStart(2, '0')}-${name}.png` })
  }

  await page.clock.install()
  await waitForLibrary(page)
  await page.goto('/')
  await snap('today-new-user')

  await nav(page, 'Plans')
  await snap('plans-templates')
  await addPushPullLegsPlan(page)
  await snap('plan-editor')
  const day = page.getByRole('region', { name: 'Push', exact: true })
  await day.getByRole('button', { name: /^Incline Dumbbell Press/ }).tap()
  await snap('plan-edit-exercise')
  await day.getByRole('button', { name: /^Incline Dumbbell Press/ }).tap()
  await day.getByRole('button', { name: 'Add exercise' }).tap()
  await snap('exercise-picker-suggestions')
  await page.getByRole('button', { name: 'Close', exact: true }).tap()
  await page.getByRole('region', { name: 'Weekly sets per muscle' }).scrollIntoViewIfNeeded()
  await snap('plan-weekly-volume')

  // First workout: baseline.
  await nav(page, 'Today')
  await snap('today-with-plan')
  await page.getByRole('button', { name: 'Start Push' }).tap()
  const bench = exerciseCard(page, 'Barbell Bench Press - Medium Grip')
  await typeInto(setInput(bench, 1, 'weight'), '80')
  await expect(setInput(bench, 4, 'weight')).toHaveValue('80')
  for (const i of [1, 2, 3, 4]) await bench.getByRole('button', { name: `Complete set ${i}` }).tap()
  await finishWorkout(page)
  await page.getByRole('link', { name: 'Done' }).tap()
  await page.clock.fastForward(2 * 86_400_000)

  // Second workout: pre-filled, a PR, the rest timer.
  await page.getByRole('button', { name: /Start Pull/ }).waitFor()
  await page.getByRole('button', { name: 'Start Push' }).tap()
  await expect(setInput(bench, 1, 'weight')).toHaveValue('80')
  await snap('workout-prefilled')
  await bench.getByRole('button', { name: 'Increase Set 1 weight' }).tap()
  await bench.getByRole('button', { name: 'Complete set 1' }).tap()
  await freezeClock(page)
  await expect(page.getByRole('status').filter({ hasText: 'New PR!' })).toBeVisible()
  await snap('workout-pr-and-rest-timer')
  await page.clock.fastForward('02:31')
  await expect(page.getByText('Rest over, time for your next set')).toBeVisible()
  await snap('workout-rest-over')
  await page.clock.resume()

  await bench.getByRole('button', { name: 'Set 2 options' }).tap()
  await snap('workout-set-menu')
  await page.getByRole('button', { name: 'Close', exact: true }).tap()
  await page.getByRole('button', { name: 'Options for Side Lateral Raise' }).tap()
  await snap('workout-exercise-menu')
  await page.getByRole('button', { name: 'Swap exercise' }).tap()
  await snap('workout-swap')
  await page.getByRole('button', { name: 'Close', exact: true }).tap()

  await finishWorkout(page)
  await snap('workout-summary')
  await page.getByRole('link', { name: 'Done' }).tap()
  await snap('today-after-workouts')

  await nav(page, 'Progress')
  await snap('progress')
  await page.getByRole('link', { name: 'Barbell Bench Press - Medium Grip' }).first().tap()
  await expect(page.locator('.stat-label', { hasText: 'Best est. 1RM' })).toBeVisible()
  await snap('exercise-history')

  await nav(page, 'Exercises')
  await page.getByRole('button', { name: 'Upper body' }).tap()
  await page.getByRole('button', { name: 'Chest', exact: true }).tap()
  await snap('exercise-library')
  await nav(page, 'Settings')
  await snap('settings')
})
