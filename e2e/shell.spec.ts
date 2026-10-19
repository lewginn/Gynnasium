import { expect, test } from '@playwright/test'

test('opens on Today with the exercise library loaded', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByText(/\d{3} exercises available offline/)).toBeVisible()
  await page.screenshot({ path: 'test-results/screens/today.png' })
})

test('bottom nav reaches every section', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const name of ['Plans', 'Exercises', 'Progress', 'Settings', 'Today']) {
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
  await page.goto('/')
  await expect(page.getByText(/exercises available offline/)).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

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

test('large title collapses into the nav bar on scroll', async ({ page }) => {
  await page.goto('/exercises')
  await expect.poll(async () => page.locator('.group li').count()).toBeGreaterThan(10)
  const bar = page.locator('.nav-bar')
  await expect(bar).toHaveAttribute('data-collapsed', 'false')
  await page.mouse.wheel(0, 600)
  await expect(bar).toHaveAttribute('data-collapsed', 'true')
  await expect(bar.locator('.nav-title')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/screens/exercises-scrolled.png' })
})

test('RPE switch toggles and persists', async ({ page }) => {
  await page.goto('/settings')
  const rpe = page.getByRole('switch', { name: 'Log RPE' })
  const before = await rpe.isChecked()
  await page.getByText('Log RPE').tap()
  await expect(rpe).toBeChecked({ checked: !before })
  await page.reload()
  await expect(rpe).toBeChecked({ checked: !before })
})

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('screens render in dark mode', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/\d{3} exercises available offline/)).toBeVisible()
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)')
    await page.screenshot({ path: 'test-results/screens/dark-today.png' })
    for (const path of ['/exercises', '/settings', '/plans']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.screenshot({ path: `test-results/screens/dark-${path.slice(1)}.png` })
    }
  })
})
