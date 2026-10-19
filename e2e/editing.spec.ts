import { expect, test, type Page } from '@playwright/test'
import { addExerciseToWorkout, addPushPullLegsPlan, exerciseCard, finishWorkout, nav, setInput, shot, typeInto, waitForLibrary } from './helpers'

// Phase 1.5: bodyweight and timed exercises, reordering mid-workout, and editing finished workouts.

async function startEmpty(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start empty workout' }).tap()
}

test('bodyweight: reps with optional added or assisted weight', async ({ page }) => {
  await waitForLibrary(page)
  await startEmpty(page)
  await addExerciseToWorkout(page, 'pullups', /^Pullups/)
  const pullups = exerciseCard(page, 'Pullups')
  await expect(pullups.getByText('+kg is added weight')).toBeVisible()
  await typeInto(setInput(pullups, 1, 'reps'), '8')
  await pullups.getByRole('button', { name: 'Complete set 1' }).tap()
  // Assisted: below zero is allowed.
  await pullups.getByRole('button', { name: 'Decrease Set 2 weight' }).tap()
  await expect(setInput(pullups, 2, 'weight')).toHaveValue('-2.5')
  await shot(page, 'p15-bodyweight')
  await finishWorkout(page)
  await expect(page.getByRole('link', { name: 'Pullups' })).toContainText('BW × 8')
  await page.getByRole('link', { name: 'Done' }).tap()

  // Next time: added weight is a PR.
  await startEmpty(page)
  await addExerciseToWorkout(page, 'pullups', /^Pullups/)
  await expect(pullups.getByText('Last time: BW × 8')).toBeVisible()
  await typeInto(setInput(pullups, 1, 'weight'), '10')
  await pullups.getByRole('button', { name: 'Complete set 1' }).tap()
  await expect(page.getByRole('status').filter({ hasText: 'New PR!' })).toContainText('Heaviest weight')
  await finishWorkout(page)
  await expect(page.getByRole('link', { name: 'Pullups' })).toContainText('+10kg × 8')

  await page.getByRole('link', { name: 'Pullups' }).tap()
  await expect(page.getByText('Most reps')).toBeVisible()
  await expect(page.getByText('+10kg', { exact: true })).toBeVisible()
})

test('timed: seconds instead of reps, longest-hold PRs', async ({ page }) => {
  await waitForLibrary(page)
  await startEmpty(page)
  await addExerciseToWorkout(page, 'plank', /^Plank/)
  const plank = exerciseCard(page, 'Plank')
  await expect(setInput(plank, 1, 'reps')).toHaveCount(0)
  const seconds = plank.getByRole('textbox', { name: 'Set 1 seconds', exact: true })
  await expect(seconds).toHaveValue('30')
  await typeInto(seconds, '60')
  await expect(plank.getByRole('textbox', { name: 'Set 3 seconds', exact: true })).toHaveValue('60')
  await plank.getByRole('button', { name: 'Complete set 1' }).tap()
  await finishWorkout(page)
  await expect(page.getByRole('link', { name: 'Plank' })).toContainText('60s')
  await page.getByRole('link', { name: 'Done' }).tap()

  await startEmpty(page)
  await addExerciseToWorkout(page, 'plank', /^Plank/)
  await plank.getByRole('button', { name: 'Increase Set 1 seconds' }).tap()
  await plank.getByRole('button', { name: 'Complete set 1' }).tap()
  await expect(page.getByRole('status').filter({ hasText: 'New PR!' })).toContainText('Longest time')
  await shot(page, 'p15-timed')
})

test('"log as" lets you change how an exercise is logged', async ({ page }) => {
  await waitForLibrary(page)
  await page.goto('/exercises/Leg_Press')
  await page.getByRole('radio', { name: 'Time' }).tap()
  await expect(page.getByRole('radio', { name: 'Time' })).toHaveAttribute('aria-checked', 'true')
  await startEmpty(page)
  await addExerciseToWorkout(page, 'leg press', /^Leg Press/)
  await expect(exerciseCard(page, 'Leg Press').getByRole('textbox', { name: 'Set 1 seconds', exact: true })).toBeVisible()
})

test('timed exercises in plans show seconds', async ({ page }) => {
  await waitForLibrary(page)
  await nav(page, 'Plans')
  await page.getByRole('button', { name: 'Use Full Body ×3 template' }).tap()
  const day = page.getByRole('region', { name: 'Full Body A', exact: true })
  await expect(day.getByRole('button', { name: /^Plank/ })).toContainText('3 × 30–60s')
  await day.getByRole('button', { name: /^Plank/ }).tap()
  await expect(day.getByText('Min sec')).toBeVisible()
})

test('reorder exercises mid-workout', async ({ page }) => {
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start Push' }).tap()
  const order = () => page.locator('.exercise-card h2').allTextContents()
  await expect.poll(async () => (await order()).slice(0, 2)).toEqual(['Barbell Bench Press - Medium Grip', 'Incline Dumbbell Press'])

  await page.getByRole('button', { name: 'Options for Incline Dumbbell Press' }).tap()
  await page.getByRole('button', { name: 'Move up' }).tap()
  await expect.poll(async () => (await order()).slice(0, 2)).toEqual(['Incline Dumbbell Press', 'Barbell Bench Press - Medium Grip'])

  // First can't move up; last can't move down.
  await page.getByRole('button', { name: 'Options for Incline Dumbbell Press' }).tap()
  await expect(page.getByRole('button', { name: 'Move up' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Move down' })).toBeVisible()
})

test('edit a finished workout: change, add, remove, then delete it', async ({ page }) => {
  await waitForLibrary(page)
  await startEmpty(page)
  await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
  const squat = exerciseCard(page, 'Barbell Squat')
  await typeInto(setInput(squat, 1, 'weight'), '100')
  await typeInto(setInput(squat, 1, 'reps'), '5')
  await squat.getByRole('button', { name: 'Complete set 1' }).tap()
  await squat.getByRole('button', { name: 'Complete set 2' }).tap()
  await finishWorkout(page)
  await expect(page.getByRole('link', { name: 'Barbell Squat' })).toContainText('100kg × 5, 5')

  // Fix a typo, add a forgotten set, and add an exercise.
  await page.getByRole('link', { name: 'Edit workout' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Edit Workout' })).toBeVisible()
  await typeInto(setInput(squat, 2, 'weight'), '102.5')
  await expect(setInput(squat, 2, 'weight')).toHaveValue('102.5')
  await squat.getByRole('button', { name: 'Add set' }).tap()
  await squat.getByRole('button', { name: 'Complete set 3' }).tap()
  await addExerciseToWorkout(page, 'leg press', /^Leg Press/)
  const legPress = exerciseCard(page, 'Leg Press')
  await typeInto(setInput(legPress, 1, 'weight'), '200')
  await legPress.getByRole('button', { name: 'Complete set 1' }).tap()
  await expect(page.getByRole('timer')).toHaveCount(0) // no rest timer when editing
  await shot(page, 'p15-edit')
  page.once('dialog', (d) => d.accept()) // unticked leg press sets are dropped
  await page.getByRole('button', { name: 'Save' }).tap()

  await expect(page.getByRole('link', { name: 'Barbell Squat' })).toContainText('100kg × 5 · 102.5kg × 5, 5')
  await expect(page.getByRole('link', { name: 'Leg Press' })).toContainText('200kg × 10')

  // Delete the whole workout.
  await page.getByRole('link', { name: 'Edit workout' }).tap()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete workout' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible()
  await expect(page.getByText('Nothing to show yet')).toBeVisible()
})
