import { expect, test } from '@playwright/test'
import { addPushPullLegsPlan, exerciseCard, finishWorkout, nav, setInput, shot, typeInto, waitForLibrary } from './helpers'

const BENCH = 'Barbell Bench Press - Medium Grip'

test('Today is a launchpad: up next, this week, latest PR, workout in progress', async ({ page }) => {
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)
  await nav(page, 'Today')

  // Up next: the day, what's in it, and one button to start. The rest of the list is a tap away.
  const hero = page.getByRole('region', { name: 'Up next' })
  await expect(hero.getByRole('heading', { name: 'Push', exact: true })).toBeVisible()
  await expect(hero.getByRole('listitem').filter({ hasText: BENCH })).toHaveText(`${BENCH}4 × 5–8`) // nothing to compare yet
  await hero.getByRole('button', { name: 'All 5 exercises' }).tap()
  await expect(page.getByRole('dialog', { name: 'Push' }).getByRole('listitem')).toHaveCount(5)
  await page.getByRole('button', { name: 'Close' }).tap()
  await expect(page.getByRole('region', { name: 'This week' })).toContainText('Workouts0 / 3')
  await shot(page, 'today-launchpad-new')

  // Do Push: it moves on to Pull, and the week fills in.
  await hero.getByRole('button', { name: 'Start Push' }).tap()
  const bench = exerciseCard(page, BENCH)
  await typeInto(setInput(bench, 1, 'weight'), '80')
  await bench.getByRole('button', { name: 'Complete set 1' }).tap()
  await finishWorkout(page)
  await page.getByRole('link', { name: 'Done' }).tap()

  await expect(hero.getByRole('heading', { name: 'Pull', exact: true })).toBeVisible()
  const week = page.getByRole('region', { name: 'This week' })
  await expect(week).toContainText('Workouts1 / 3')
  await expect(week).toContainText('Streak1 week')
  await expect(week.getByRole('listitem', { name: /\(today\): trained/ })).toBeVisible()
  await expect(week).toContainText(/Volume\d/)

  // Push again from "Other days", heavier: a PR, which Today celebrates.
  await page.getByRole('button', { name: 'Start Push' }).tap()
  await bench.getByRole('button', { name: 'Increase Set 1 weight' }).tap()
  await bench.getByRole('button', { name: 'Complete set 1' }).tap()
  await finishWorkout(page)
  await page.getByRole('link', { name: 'Done' }).tap()

  const pr = page.getByRole('link', { name: /Latest PR/ })
  await expect(pr).toContainText(BENCH)
  await expect(pr).toContainText('82.5kg × 8')
  await expect(page.getByRole('heading', { name: 'Recent workouts' })).toBeVisible()
  await shot(page, 'today-launchpad')

  // Start Pull, then step away and keep it for later.
  await page.getByRole('button', { name: 'Start Pull' }).tap()
  await page.getByRole('button', { name: 'Leave workout' }).tap()
  await page.getByRole('button', { name: /Keep it for later/ }).tap()

  // A workout in progress takes over the hero.
  const live = page.getByRole('region', { name: 'Workout in progress' })
  await expect(live.getByRole('link', { name: 'Resume workout' })).toBeVisible()
  await expect(live).toContainText(/0 of \d+ sets done/)
  await expect(page.getByRole('region', { name: 'Up next' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start empty workout' })).toHaveCount(0)
  await shot(page, 'today-in-progress')
})

test('Up next shows last time’s best set for each exercise', async ({ page }) => {
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)
  await nav(page, 'Today')
  for (const day of ['Push', 'Pull', 'Legs']) {
    await page.getByRole('button', { name: `Start ${day}` }).tap()
    if (day === 'Push') {
      const bench = exerciseCard(page, BENCH)
      await typeInto(setInput(bench, 1, 'weight'), '80')
      await bench.getByRole('button', { name: 'Complete set 1' }).tap()
      await typeInto(setInput(bench, 2, 'weight'), '85')
      await typeInto(setInput(bench, 2, 'reps'), '5')
      await bench.getByRole('button', { name: 'Complete set 2' }).tap()
    } else {
      await page.getByRole('button', { name: 'Complete set 1' }).first().tap()
    }
    await finishWorkout(page)
    await page.getByRole('link', { name: 'Done' }).tap()
  }

  const hero = page.getByRole('region', { name: 'Up next' })
  await expect(hero.getByRole('heading', { name: 'Push', exact: true })).toBeVisible()
  await expect(hero.getByRole('listitem').filter({ hasText: BENCH })).toContainText('last time 85kg × 5')
  await shot(page, 'today-up-next-history')
})
