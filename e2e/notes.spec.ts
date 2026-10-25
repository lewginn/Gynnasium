import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { addExerciseToWorkout, exerciseCard, finishWorkout, nav, setInput, shot, typeInto, waitForLibrary } from './helpers'

// Sticky notes on exercises: written mid-workout, shown every time you do that exercise and on its page.

test.use({ viewport: { width: 390, height: 844 } }) // iPhone 15 width: the set grid is the tightest screen

const SQUAT = 'Barbell Squat'

async function startWithSquat(page: Page) {
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start empty workout' }).tap()
  await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
  return exerciseCard(page, SQUAT)
}

async function seriousAxe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${label}: ${v.id} – ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)
  expect(serious, serious.join('\n')).toEqual([])
}

async function expectTappable(control: Locator) {
  const box = (await control.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test('add a note mid-workout, see it next time and on the exercise page, edit it, clear it', async ({ page }) => {
  await waitForLibrary(page)
  // With RPE on, so the tightest version of the set grid is checked.
  await page.goto('/settings')
  await page.getByLabel(/Log RPE/).tap()
  await expect(page.getByLabel(/Log RPE/)).toBeChecked()

  let squat = await startWithSquat(page)
  const add = squat.getByRole('button', { name: `Add a note to ${SQUAT}` })
  await expectTappable(add)
  await add.tap()
  const sheet = page.getByRole('dialog', { name: SQUAT })
  const note = sheet.getByRole('textbox', { name: 'Note' })
  await expect(note).toBeFocused()
  expect(await note.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16) // no zoom on focus
  await expect(sheet.getByRole('button', { name: 'Clear note' })).toHaveCount(0) // nothing to clear yet
  await note.fill('Seat 4, grip wide')
  await shot(page, 'exercise-notes-sheet')
  await seriousAxe(page, 'note sheet')
  await sheet.getByRole('button', { name: 'Save' }).tap()
  await expect(sheet).toBeHidden()

  const line = squat.getByRole('button', { name: 'Edit note: Seat 4, grip wide' })
  await expect(line).toBeVisible()
  await expect(add).toHaveCount(0)
  await expectTappable(line)
  // The note sits between the name and the sets, and the grid still fits.
  const nameBox = (await squat.getByRole('heading', { name: SQUAT }).boundingBox())!
  const lineBox = (await line.boundingBox())!
  const gridBox = (await setInput(squat, 1, 'weight').boundingBox())!
  expect(lineBox.y).toBeGreaterThan(nameBox.y)
  expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(gridBox.y)
  await expect(squat.getByLabel('Set 1 RPE')).toBeVisible()
  expect(await noSideScroll(page)).toBe(true)
  await typeInto(setInput(squat, 1, 'weight'), '100')
  await squat.getByRole('button', { name: 'Complete set 1' }).tap()
  await shot(page, 'exercise-notes-card')
  await seriousAxe(page, 'workout with a note')

  // Cancel leaves it as it was.
  await line.tap()
  await sheet.getByRole('textbox', { name: 'Note' }).fill('Something else')
  await sheet.getByRole('button', { name: 'Cancel' }).tap()
  await expect(sheet).toBeHidden()
  await expect(line).toBeVisible()
  await finishWorkout(page)

  // The next workout with squats shows it.
  squat = await startWithSquat(page)
  await expect(squat.getByRole('button', { name: 'Edit note: Seat 4, grip wide' })).toBeVisible()

  // So does the exercise page, where it can be edited too.
  await page.goto(`/exercises/Barbell_Squat`)
  const card = page.getByRole('region', { name: 'Note', exact: true })
  await expect(card).toContainText('Seat 4, grip wide')
  await card.getByRole('button', { name: 'Edit note' }).tap()
  await sheet.getByRole('textbox', { name: 'Note' }).fill('Seat 5, grip wide\nSafety bars at 7')
  await sheet.getByRole('button', { name: 'Save' }).tap()
  await expect(card).toContainText('Seat 5, grip wide')
  await expect(card).toContainText('Safety bars at 7')
  await page.reload() // saved, not just shown
  await expect(card).toContainText('Seat 5, grip wide')

  // Back in the workout: the edit shows, and a long note is cut off at two lines.
  await page.goBack()
  squat = exerciseCard(page, SQUAT)
  await expect(squat.getByRole('button', { name: /^Edit note: Seat 5, grip wide/ })).toBeVisible()
  await squat.getByRole('button', { name: /^Edit note:/ }).tap()
  await sheet.getByRole('textbox', { name: 'Note' }).fill('Use the left cable stack, the right one sticks. Seat on 4, back pad on 2, grip just outside the knurling, and the bar sits low on the traps.')
  await sheet.getByRole('button', { name: 'Save' }).tap()
  const text = squat.locator('.note-text')
  await expect(text).toContainText('Use the left cable stack')
  const lineHeight = await text.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
  expect((await text.boundingBox())!.height).toBeLessThanOrEqual(lineHeight * 2 + 1)
  expect(await noSideScroll(page)).toBe(true)

  // Clearing it brings back the add button, here and on the exercise page.
  await squat.getByRole('button', { name: /^Edit note:/ }).tap()
  await sheet.getByRole('button', { name: 'Clear note' }).tap()
  await expect(sheet).toBeHidden()
  await expect(squat.getByRole('button', { name: /^Edit note:/ })).toHaveCount(0)
  await expect(squat.getByRole('button', { name: `Add a note to ${SQUAT}` })).toBeVisible()
  await page.goto(`/exercises/Barbell_Squat`)
  await expect(page.getByRole('region', { name: 'Note', exact: true }).getByRole('button', { name: 'Add note' })).toBeVisible()
})
