import { expect, test } from './fixtures'
import { addExerciseToWorkout, exerciseCard, finishWorkout, nav, setInput, shot, typeInto, waitForLibrary } from './helpers'

test('log bodyweight: 7-day average, change, chart, table, delete', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 1, 8) })
  await waitForLibrary(page)
  await nav(page, 'Progress')
  const body = page.getByRole('region', { name: 'Body' })
  await expect(body).toContainText('No bodyweight logged yet')

  // A month of weigh-ins, trending down 0.1kg a day.
  for (let day = 0; day < 30; day += 3) {
    await body.getByRole('button', { name: 'Log' }).tap()
    const sheet = page.getByRole('dialog', { name: 'Log measurement' })
    await typeInto(sheet.getByRole('textbox', { name: 'Bodyweight' }), String(84 - day * 0.1))
    await sheet.getByRole('button', { name: 'Save' }).tap()
    await expect(sheet).toBeHidden()
    await page.clock.fastForward(3 * 86_400_000)
  }
  await expect(body.locator('.stat-label', { hasText: '7-day average' })).toBeVisible()
  await expect(body.getByText(/since (1 Oct|Oct 1)/)).toBeVisible() // under 4 weeks of data: compared with the first entry
  await expect(body).toContainText('−2.') // trending down ~0.1kg/day over 27 days, smoothed
  await expect(body.getByRole('img', { name: /Bodyweight over time/ })).toBeVisible()
  await expect(body.locator('.chart-legend')).toContainText('Daily7-day average')
  await shot(page, 'p2-body')

  // Tooltip on touch.
  const chart = body.getByRole('img', { name: /Bodyweight over time/ })
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  await expect(body.getByRole('status')).toBeVisible()

  // Table view and delete.
  await body.getByText('Entries').tap()
  const rows = body.locator('.entry-list li')
  await expect(rows).toHaveCount(10)
  await rows.first().getByRole('button').tap()
  await expect(rows).toHaveCount(9)

  // Units follow settings.
  await nav(page, 'Settings')
  await page.getByRole('radio', { name: 'lb' }).tap()
  await nav(page, 'Progress')
  await expect(body).toContainText('lb')
})

test('lift trends, weekly sets and exercise chart', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 1, 18) })
  await waitForLibrary(page)
  for (const kg of ['100', '102.5', '105']) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Start empty workout' }).tap()
    await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
    const squat = exerciseCard(page, 'Barbell Squat')
    await typeInto(setInput(squat, 1, 'weight'), kg)
    await typeInto(setInput(squat, 1, 'reps'), '5')
    for (const i of [1, 2, 3]) await squat.getByRole('button', { name: `Complete set ${i}` }).tap()
    await finishWorkout(page)
    await page.clock.fastForward(4 * 86_400_000)
  }

  await page.goto('/progress')
  const lifts = page.getByRole('region', { name: 'Your main lifts' })
  await expect(lifts.getByRole('link', { name: /Barbell Squat/ })).toContainText('+5.0%')
  const weeks = page.getByRole('region', { name: 'Working sets per week' })
  await expect(weeks.getByRole('img')).toBeVisible()
  await shot(page, 'p2-progress')

  await lifts.getByRole('link', { name: /Barbell Squat/ }).tap()
  const trend = page.getByRole('region', { name: 'Best est. 1RM' })
  await expect(trend.getByRole('img')).toHaveAttribute('aria-label', /Latest 12\d\.\d/)
  await trend.getByText('Show as table').tap()
  await expect(trend.getByRole('row')).toHaveCount(4)
  await shot(page, 'p2-exercise-trend')
})
