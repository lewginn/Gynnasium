import { expect, test } from './fixtures'
import { addPushPullLegsPlan, exerciseCard, finishWorkout, nav, setInput, shot, typeInto, waitForLibrary } from './helpers'

const BENCH = 'Barbell Bench Press - Medium Grip'

async function logBench(page: import('@playwright/test').Page, kg: string, sets: number) {
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start Push' }).tap()
  const bench = exerciseCard(page, BENCH)
  await typeInto(setInput(bench, 1, 'weight'), kg)
  for (let i = 1; i <= sets; i++) await bench.getByRole('button', { name: `Complete set ${i}` }).tap()
  await finishWorkout(page)
  await page.getByRole('link', { name: 'Done' }).tap()
}

test('progressive overload: more reps, then more weight; can be turned off per exercise', async ({ page }) => {
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)

  // Bench is 4 × 5–8. First time: top of the range, no history.
  await logBench(page, '80', 2) // 80 × 8 twice, two sets short
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start Push' }).tap()
  const bench = exerciseCard(page, BENCH)
  // Not every planned set was done, so no jump yet: same weight, reps held at the top.
  await expect(bench.getByText('Same weight, aim for one more rep per set (up to 8).')).toBeVisible()
  await expect(setInput(bench, 4, 'weight')).toHaveValue('80')
  for (let i = 1; i <= 4; i++) await bench.getByRole('button', { name: `Complete set ${i}` }).tap()
  await finishWorkout(page)
  await page.getByRole('link', { name: 'Done' }).tap()

  // All four sets at 8: up a step, back to the bottom of the range.
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start Push' }).tap()
  await expect(bench.getByText('Hit 8 on every set last time: up to 82.5kg.')).toBeVisible()
  await expect(setInput(bench, 1, 'weight')).toHaveValue('82.5')
  await expect(setInput(bench, 1, 'reps')).toHaveValue('5')
  await shot(page, 'p4-progression')
  await page.getByRole('button', { name: 'Leave workout' }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Discard workout' }).tap()

  // Off: just repeat last time.
  await nav(page, 'Plans')
  await page.getByRole('link', { name: /Push \/ Pull \/ Legs/ }).tap()
  await page.getByRole('button', { name: new RegExp(`^${BENCH}`) }).tap()
  await page.getByLabel('Progression').selectOption('none')
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start Push' }).tap()
  await expect(setInput(bench, 1, 'weight')).toHaveValue('80')
  await expect(setInput(bench, 1, 'reps')).toHaveValue('8')
  await expect(bench.locator('.progression-note')).toHaveCount(0)
})
