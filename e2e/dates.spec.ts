import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { addExerciseToWorkout, exerciseCard, finishWorkout, setInput, shot, typeInto, waitForLibrary } from './helpers'

// A 24-hour phone, so the times read as they do on the owner's.
test.use({ locale: 'en-GB' })

async function squatWorkout(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start empty workout' }).tap()
  await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
  const squat = exerciseCard(page, 'Barbell Squat')
  await typeInto(setInput(squat, 1, 'weight'), '100')
  await squat.getByRole('button', { name: 'Complete set 1' }).tap()
  await finishWorkout(page)
}

test('workouts with the same name are told apart by when they were', async ({ page }) => {
  // Four workouts all called "Workout", the last one this morning (Sunday 25 October 2026).
  await page.clock.install({ time: new Date(2026, 9, 14, 18, 30) })
  await waitForLibrary(page)
  await squatWorkout(page)
  for (const at of [new Date(2026, 9, 21, 18, 30), new Date(2026, 9, 24, 18, 30), new Date(2026, 9, 25, 7, 15)]) {
    await page.clock.setSystemTime(at)
    await squatWorkout(page)
  }

  // Today: the name stays the title, and when it was (and how long) is the line under it.
  await page.goto('/')
  const rows = page.locator('h2', { hasText: 'Recent workouts' }).locator('xpath=following-sibling::ul[1]').getByRole('link')
  await expect(rows).toHaveCount(4)
  for (const row of await rows.all()) await expect(row.locator('.list-title')).toHaveText('Workout')
  await expect(rows.nth(0)).toContainText(/Today, 07:15 · (<1|\d+) min/)
  await expect(rows.nth(1)).toContainText('Yesterday, 18:30 · ')
  await expect(rows.nth(2)).toContainText('Wed, 18:30 · ')
  await expect(rows.nth(3)).toContainText('Wed 14 Oct, 18:30 · ')
  await rows.nth(3).scrollIntoViewIfNeeded()
  await shot(page, 'workout-dates/today-recent')

  // The workout's own page has the full date and time under its name.
  await rows.nth(1).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Workout' })).toBeVisible()
  await expect(page.locator('.page-header')).toContainText(/Saturday,? 24 October 2026, 18:30/)
  await shot(page, 'workout-dates/session')

  // Its edit page, and the exercise's history, say when too.
  await page.getByRole('link', { name: 'Edit workout' }).tap()
  await expect(page.locator('.workout-header')).toContainText('Yesterday, 18:30')
  await page.goBack()
  await page.getByRole('link', { name: /^Barbell Squat/ }).tap()
  const history = page.getByRole('region', { name: 'History' })
  await expect(history.getByRole('link')).toHaveText(['Today, 07:15', 'Yesterday, 18:30', 'Wed, 18:30', 'Wed 14 Oct, 18:30'])
  await history.scrollIntoViewIfNeeded()
  await shot(page, 'workout-dates/exercise-history')

  // Progress lists them the same way.
  await page.goto('/progress')
  const all = page.locator('h2', { hasText: 'Workout history' }).locator('xpath=following-sibling::ul[1]').getByRole('link')
  await expect(all.nth(0)).toContainText('Today, 07:15 · ')
  await expect(all.nth(3)).toContainText('Wed 14 Oct, 18:30 · ')
})
