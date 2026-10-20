import { expect, test } from './fixtures'

test('opens on Today with a way to get started', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create a plan' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start empty workout' })).toBeVisible()
  await page.screenshot({ path: 'test-results/screens/today-empty.png' })
})

test('bottom nav reaches every section', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const name of ['Plans', 'Exercises', 'Progress', 'Social', 'Today']) {
    await nav.getByRole('link', { name }).tap()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  }
})

test('exercise library filters by region, muscle and search', async ({ page }) => {
  await page.goto('/exercises')
  const count = page.getByText(/^\d+ exercises$/)
  const shown = async () => Number((await count.textContent())!.split(' ')[0])
  // The library seeds on first launch, so wait for it rather than reading "0 exercises".
  await expect.poll(shown).toBeGreaterThan(500)
  const all = await shown()

  await page.getByRole('button', { name: 'Upper body' }).tap()
  await page.getByRole('button', { name: 'Lats' }).tap()
  await expect.poll(shown).toBeLessThan(all)
  expect(await shown()).toBeGreaterThan(5)
  await page.screenshot({ path: 'test-results/screens/exercises-lats.png' })

  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('pulldown')
  await expect(page.getByRole('link', { name: /Pulldown/i }).first()).toBeVisible()

  await page.getByRole('link', { name: /Pulldown/i }).first().tap()
  await expect(page.getByText('Primary')).toBeVisible()
  await expect(page.getByText('Lats', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/screens/exercise-detail.png' })
})

test('units setting persists across reloads', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('radio', { name: 'lb' }).tap()
  await expect(page.getByRole('radio', { name: 'lb' })).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await expect(page.getByRole('radio', { name: 'lb' })).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: 'test-results/screens/settings.png' })
})

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/exercises')
  await expect.poll(async () => Number((await page.getByText(/^\d+ exercises$/).textContent())?.split(' ')[0])).toBeGreaterThan(500)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Exercises' })).toBeVisible()

  // Deep links work offline too.
  await page.goto('/exercises')
  await expect(page.getByText(/^\d+ exercises$/)).toBeVisible()
})

test('fits a phone screen without sideways scrolling', async ({ page }) => {
  for (const path of ['/', '/exercises', '/settings']) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})
