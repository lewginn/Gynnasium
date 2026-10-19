import { expect, type Locator, type Page } from '@playwright/test'

export const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png` })

export const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).tap()

/** The exercise library seeds into IndexedDB on first launch; wait for it. */
export async function waitForLibrary(page: Page) {
  await page.goto('/exercises')
  await expect.poll(async () => Number((await page.getByText(/^\d+ exercises$/).textContent())?.split(' ')[0])).toBeGreaterThan(500)
}

export async function addPushPullLegsPlan(page: Page) {
  await nav(page, 'Plans')
  await page.getByRole('button', { name: 'Use Push / Pull / Legs template' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Push / Pull / Legs' })).toBeVisible()
}

export const exerciseCard = (page: Page, name: string) => page.getByRole('region', { name })

export function setInput(card: Locator, set: number, field: 'weight' | 'reps') {
  return card.getByRole('textbox', { name: `Set ${set} ${field}`, exact: true })
}

export async function typeInto(input: Locator, value: string) {
  await input.fill(value)
  await input.press('Enter')
}

export async function addExerciseToWorkout(page: Page, search: string, name: RegExp) {
  await page.getByRole('button', { name: 'Add exercise' }).tap()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('searchbox').fill(search)
  await dialog.getByRole('button', { name }).first().tap()
  await expect(dialog).toBeHidden()
}

/** Taps the go-ahead button in the confirmation sheet. */
export async function confirmSheet(page: Page, action: string) {
  await page.getByRole('dialog').getByRole('button', { name: action, exact: true }).tap()
}

/** Finish the current workout, going ahead if the "unticked sets" confirmation appears. */
export async function finishWorkout(page: Page) {
  await page.getByRole('button', { name: 'Finish', exact: true }).tap()
  const sheet = page.getByRole('dialog')
  const summary = page.getByText('Duration')
  await expect(summary.or(sheet)).toBeVisible()
  if (await sheet.isVisible()) await confirmSheet(page, 'Finish')
  await expect(summary).toBeVisible()
}

/**
 * Freezes the page clock (installed with page.clock.install) so countdowns don't drift on a busy machine.
 * Pauses up to a second ahead (it can't pause in the past), so a countdown may read one second lower.
 */
export async function freezeClock(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
}
