import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures'
import { addExerciseToWorkout, addPushPullLegsPlan, exerciseCard, finishWorkout, nav, setInput, typeInto, waitForLibrary } from './helpers'

const BENCH = 'Barbell Bench Press - Medium Grip'
// The tightest phone width the layout is checked at (iPhone 15's profile is 393).
test.use({ viewport: { width: 390, height: 844 } })

const cardShot = (card: Locator, name: string) => card.screenshot({ path: `test-results/screens/warmup/${name}.png` })

test('one tap adds a warm-up set before the first working set', async ({ page }) => {
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)

  // First workout: offered at any weight, even before one is entered, and gone once a set is done.
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start Push' }).tap()
  const bench = exerciseCard(page, BENCH)
  const warmup = bench.getByRole('button', { name: 'Warm-up' })
  await expect(bench.getByText('No history yet')).toBeVisible()
  await expect(warmup).toBeVisible()
  await typeInto(setInput(bench, 1, 'weight'), '60')
  await expect(warmup).toBeVisible()
  await bench.getByRole('button', { name: 'Complete set 1' }).tap()
  await expect(warmup).toHaveCount(0)
  await finishWorkout(page)
  await page.getByRole('link', { name: 'Done' }).tap()

  // Second workout: pre-filled with 60 × 8 from last time.
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start Push' }).tap()
  await expect(setInput(bench, 1, 'weight')).toHaveValue('60')
  await expect(setInput(bench, 1, 'reps')).toHaveValue('8')

  // No warm-ups for a bodyweight exercise, even with weight added.
  await addExerciseToWorkout(page, 'pullups', /^Pullups/)
  const pullups = exerciseCard(page, 'Pullups')
  await typeInto(setInput(pullups, 1, 'weight'), '10')
  await expect(pullups.getByRole('button', { name: 'Add set' })).toBeVisible()
  await expect(pullups.getByRole('button', { name: 'Warm-up' })).toHaveCount(0)

  await bench.scrollIntoViewIfNeeded()
  await expect(warmup).toBeVisible()
  const gridBefore = await bench.locator('.set-grid-head').boundingBox()
  await cardShot(bench, 'before')
  await warmup.tap()

  // Half the working weight × 10, then the working sets.
  const rows = bench.locator('.set-row')
  await expect(rows).toHaveCount(5)
  const expected: [string, string, string][] = [
    ['Set W', '30', '10'],
    ['Set 1', '60', '8'],
    ['Set 2', '60', '8'],
  ]
  for (const [i, [name, kg, reps]] of expected.entries()) {
    await expect(rows.nth(i)).toHaveAttribute('aria-label', name)
    await expect(rows.nth(i).getByRole('textbox', { name: `${name} weight`, exact: true })).toHaveValue(kg)
    await expect(rows.nth(i).getByRole('textbox', { name: `${name} reps`, exact: true })).toHaveValue(reps)
  }
  // The set to look at is the first warm-up; the button is gone, and the grid stayed where it was.
  await expect(bench.locator('.set-row.current')).toHaveCount(1)
  await expect(rows.first()).toHaveClass(/current/)
  await expect(warmup).toHaveCount(0)
  expect(await bench.locator('.set-grid-head').boundingBox()).toEqual(gridBefore)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await cardShot(bench, 'after')

  // Done as a working set, 30 × 10 would beat 60 × 8 for reps. As a warm-up it never counts.
  await bench.getByRole('button', { name: 'Complete set W' }).tap()
  await expect(bench.getByRole('button', { name: 'Undo set W' })).toHaveCount(1)
  await expect(bench.locator('.pr-mark')).toHaveCount(0)
  await expect(page.getByText('New PR')).toHaveCount(0)
  await expect(rows.nth(1)).toHaveClass(/current/)
  await expect(warmup).toHaveCount(0)
})

test('the Warm-up button fits beside Add set with RPE on', async ({ page }) => {
  await waitForLibrary(page)
  await page.goto('/settings')
  await page.getByLabel(/Log RPE/).tap()
  await expect(page.getByLabel(/Log RPE/)).toBeChecked()

  await page.goto('/')
  await page.getByRole('button', { name: 'Start empty workout' }).tap()
  await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
  const squat = exerciseCard(page, 'Barbell Squat')
  await typeInto(setInput(squat, 1, 'weight'), '100')
  await cardShot(squat, 'rpe-before')
  await squat.getByRole('button', { name: 'Warm-up' }).tap()
  await expect(squat.getByLabel('Set W RPE')).toHaveCount(1)
  await expect(squat.getByRole('button', { name: 'Add set' })).toBeVisible()
  const card = (await squat.boundingBox())!
  const add = (await squat.getByRole('button', { name: 'Add set' }).boundingBox())!
  expect(add.height).toBeGreaterThanOrEqual(44)
  expect(add.x + add.width).toBeLessThanOrEqual(card.x + card.width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await cardShot(squat, 'rpe-after')
})
