import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { addPushPullLegsPlan, exerciseCard, finishWorkout, nav, shot, waitForLibrary } from './helpers'

const upNext = (page: Page) => page.getByRole('region', { name: 'Up next' })

async function doNext(page: Page, exercise: string) {
  await upNext(page).getByRole('button', { name: /^Start / }).tap()
  await exerciseCard(page, exercise).getByRole('button', { name: 'Complete set 1' }).tap()
  await finishWorkout(page)
  await page.getByRole('link', { name: 'Done' }).tap()
}

test('alternating weeks: week A, then week B, then back to A', async ({ page }) => {
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)

  await page.getByRole('checkbox', { name: /Alternate weeks/ }).tap()
  await expect(page.getByRole('checkbox', { name: /Alternate weeks/ })).toBeChecked()
  await expect(page.getByRole('heading', { name: 'Week A' })).toBeVisible()
  // Legs moves to week B.
  await page.getByRole('group', { name: 'Week A days' }).getByRole('button', { name: 'Legs · Week A' }).tap()
  await page.getByRole('radiogroup', { name: 'Week' }).getByRole('radio', { name: 'Week B' }).tap()
  await expect(page.getByRole('group', { name: 'Week B days' }).getByRole('button', { name: 'Legs · Week B' })).toBeVisible()
  await shot(page, 'p4-weeks-plan')

  await nav(page, 'Today')
  await expect(upNext(page)).toContainText('Up next in Push / Pull / Legs · Week A')
  await expect(upNext(page).getByRole('heading', { name: 'Push' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Legs · Week B' })).toBeVisible()
  await shot(page, 'p4-weeks-today')

  await doNext(page, 'Barbell Bench Press - Medium Grip')
  await expect(upNext(page).getByRole('heading', { name: 'Pull' })).toBeVisible()
  await doNext(page, 'Pullups')
  await expect(upNext(page)).toContainText('Week B')
  await expect(upNext(page).getByRole('heading', { name: 'Legs' })).toBeVisible()
  await doNext(page, 'Barbell Squat')
  await expect(upNext(page)).toContainText('Week A')

  // Workouts are named with their week.
  await nav(page, 'Progress')
  await expect(page.getByRole('link', { name: /Legs · Week B/ })).toBeVisible()
})
