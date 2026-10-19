import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import {
  addExerciseToWorkout,
  exerciseCard,
  finishWorkout,
  freezeClock,
  nav,
  setInput,
  shot,
  typeInto,
  addPushPullLegsPlan,
  waitForLibrary,
} from './helpers'

// Broader QA coverage: the less-travelled paths, phone hardware calls, accessibility and speed.

/** Records calls the app makes to the vibration motor, speaker and screen wake lock. */
async function recordHardware(page: Page) {
  await page.addInitScript(() => {
    const log: string[] = []
    ;(window as unknown as { __hw: string[] }).__hw = log
    navigator.vibrate = (pattern: VibratePattern) => {
      log.push(`vibrate:${JSON.stringify(pattern)}`)
      return true
    }
    const Real = window.AudioContext
    window.AudioContext = class extends Real {
      createOscillator() {
        const osc = super.createOscillator()
        const start = osc.start.bind(osc)
        osc.start = (when?: number) => {
          log.push('beep')
          start(when)
        }
        return osc
      }
    } as typeof AudioContext
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: async () => {
          log.push('wakelock')
          return { release: async () => log.push('wakelock-release'), addEventListener() {} }
        },
      },
    })
  })
  return () => page.evaluate(() => (window as unknown as { __hw: string[] }).__hw)
}

test.describe('phone hardware', () => {
  test('rest over beeps three times and vibrates; screen kept awake during workouts', async ({ page }) => {
    const hw = await recordHardware(page)
    await page.clock.install()
    await waitForLibrary(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Start empty workout' }).tap()
    await expect.poll(hw).toContain('wakelock')

    await addExerciseToWorkout(page, 'triceps pushdown', /^Triceps Pushdown/)
    await exerciseCard(page, 'Triceps Pushdown').getByRole('button', { name: 'Complete set 1' }).tap()
    await expect(page.getByRole('timer')).toContainText('1:30')
    expect((await hw()).filter((c) => c === 'beep')).toHaveLength(0)

    await page.clock.fastForward('01:31')
    await expect(page.getByText('Rest over, time for your next set')).toBeVisible()
    const calls = await hw()
    expect(calls.filter((c) => c === 'beep')).toHaveLength(3)
    expect(calls).toContain('vibrate:[300,150,300,150,300]')

    // Leaving the workout screen (in-app, so the page isn't reloaded) releases the wake lock.
    await page.getByRole('button', { name: 'Options for Triceps Pushdown' }).tap()
    await page.getByRole('link', { name: 'History & details' }).tap()
    await expect.poll(hw).toContain('wakelock-release')
  })
})

test.describe('rest timer', () => {
  test('+15, −15 and skip', async ({ page }) => {
    await page.clock.install()
    await waitForLibrary(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Start empty workout' }).tap()
    await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
    await exerciseCard(page, 'Barbell Squat').getByRole('button', { name: 'Complete set 1' }).tap()
    await freezeClock(page)

    const timer = page.getByRole('timer')
    await expect(timer).toContainText(/2:(29|30)/)
    await page.getByRole('button', { name: '15 seconds more' }).tap()
    await expect(timer).toContainText(/2:(44|45)/)
    await page.getByRole('button', { name: '15 seconds less' }).tap()
    await page.getByRole('button', { name: '15 seconds less' }).tap()
    await expect(timer).toContainText(/2:(14|15)/)
    await page.getByRole('button', { name: 'Skip rest' }).tap()
    await expect(timer).toBeHidden()
    await page.clock.resume()

    // Un-ticking a set doesn't start a timer; re-ticking does.
    const squat = exerciseCard(page, 'Barbell Squat')
    await squat.getByRole('button', { name: 'Undo set 1' }).tap()
    await expect(timer).toBeHidden()
    await squat.getByRole('button', { name: 'Complete set 1' }).tap()
    await expect(timer).toBeVisible()
  })
})

test.describe('sets', () => {
  test('add, delete, and warm-ups that never count as PRs', async ({ page }) => {
    await waitForLibrary(page)
    await page.goto('/')

    // Baseline workout.
    await page.getByRole('button', { name: 'Start empty workout' }).tap()
    await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
    let squat = exerciseCard(page, 'Barbell Squat')
    await typeInto(setInput(squat, 1, 'weight'), '100')
    await squat.getByRole('button', { name: 'Complete set 1' }).tap()
    await finishWorkout(page)
    await page.getByRole('link', { name: 'Done' }).tap()

    await page.getByRole('button', { name: 'Start empty workout' }).tap()
    await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
    squat = exerciseCard(page, 'Barbell Squat')

    // Add set copies the last one.
    await squat.getByRole('button', { name: 'Add set' }).tap()
    await expect(setInput(squat, 4, 'weight')).toHaveValue('100')

    // Delete set 4.
    await squat.getByRole('button', { name: 'Set 4 options' }).tap()
    await page.getByRole('button', { name: 'Delete set' }).tap()
    await expect(setInput(squat, 4, 'weight')).toHaveCount(0)

    // Mark set 1 as a warm-up: label becomes W and numbering of working sets restarts.
    await squat.getByRole('button', { name: 'Set 1 options' }).tap()
    await page.getByRole('radio', { name: 'Warm-up' }).tap()
    await expect(squat.getByRole('button', { name: 'Set W options' })).toBeVisible()
    await expect(squat.getByRole('button', { name: 'Set 2 options' })).toBeVisible()
    await expect(squat.getByRole('button', { name: 'Set 3 options' })).toHaveCount(0)

    // A heavy warm-up isn't a PR.
    await typeInto(squat.getByRole('textbox', { name: 'Set W weight', exact: true }), '140')
    await squat.getByRole('button', { name: 'Complete set W' }).tap()
    await expect(page.getByRole('status').filter({ hasText: 'New PR!' })).toHaveCount(0)

    // A heavier working set is.
    await typeInto(setInput(squat, 1, 'weight'), '105')
    await squat.getByRole('button', { name: 'Complete set 1' }).tap()
    await expect(page.getByRole('status').filter({ hasText: 'New PR!' })).toBeVisible()
    await shot(page, 'qa-sets')
  })

  test('fast repeated taps on − / + all count', async ({ page }) => {
    await waitForLibrary(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Start empty workout' }).tap()
    await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
    const squat = exerciseCard(page, 'Barbell Squat')
    // 8 taps back-to-back with no gap, faster than any thumb: each must build on the last (8 × 2.5kg).
    await squat.getByRole('button', { name: 'Increase Set 1 weight' }).evaluate((btn: HTMLElement) => {
      for (let i = 0; i < 8; i++) btn.click()
    })
    await expect(setInput(squat, 1, 'weight')).toHaveValue('20')
    // Saved, not just shown: survives a reload.
    await expect(setInput(squat, 2, 'weight')).toHaveValue('20')
    await page.reload()
    await expect(setInput(squat, 1, 'weight')).toHaveValue('20')
  })

  test('RPE column appears when enabled and feeds the 1RM estimate', async ({ page }) => {
    await waitForLibrary(page)
    await page.goto('/settings')
    // The toggle reflects the saved setting a moment after the tap.
    await page.getByLabel(/Log RPE/).tap()
    await expect(page.getByLabel(/Log RPE/)).toBeChecked()

    await page.goto('/')
    await page.getByRole('button', { name: 'Start empty workout' }).tap()
    await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
    const squat = exerciseCard(page, 'Barbell Squat')
    await expect(squat.getByLabel('Set 1 RPE')).toBeVisible()
    await typeInto(setInput(squat, 1, 'weight'), '100')
    await typeInto(setInput(squat, 1, 'reps'), '5')
    await squat.getByLabel('Set 1 RPE').selectOption('8')
    await squat.getByRole('button', { name: 'Complete set 1' }).tap()
    await shot(page, 'qa-rpe')
    await finishWorkout(page)

    // 100 x 5 @ RPE 8 ≈ 100 x 7 to failure: (Epley 123.3 + Brzycki 120) / 2 ≈ 121.7kg
    await page.getByRole('link', { name: 'Barbell Squat' }).tap()
    await expect(page.getByText('121.7kg')).toBeVisible()
  })
})

test.describe('workouts', () => {
  test('remove an exercise, discard a workout, and finishing with nothing ticked', async ({ page }) => {
    await waitForLibrary(page)
    await addPushPullLegsPlan(page)
    await page.getByRole('button', { name: 'Start Push' }).tap()

    await page.getByRole('button', { name: 'Options for Side Lateral Raise' }).tap()
    await page.getByRole('button', { name: 'Remove from workout' }).tap()
    await expect(exerciseCard(page, 'Side Lateral Raise')).toHaveCount(0)

    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Discard workout' }).tap()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(page.getByText('Workout in progress')).toHaveCount(0)
    await expect(page.getByText('Recent workouts')).toHaveCount(0)

    // Finish with nothing ticked: confirm discards it.
    await page.getByRole('button', { name: 'Start Push' }).tap()
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Finish' }).tap()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(page.getByText('Recent workouts')).toHaveCount(0)

    // Cancelling the confirm keeps you in the workout.
    await page.getByRole('button', { name: 'Start Push' }).tap()
    page.once('dialog', (d) => d.dismiss())
    await page.getByRole('button', { name: 'Finish' }).tap()
    await expect(page.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible()
  })

  test('look at a day without starting it; leave a workout and keep it or discard it', async ({ page }) => {
    await waitForLibrary(page)
    await addPushPullLegsPlan(page)
    await nav(page, 'Today')

    // Preview a day: no workout is started.
    await page.getByRole('button', { name: 'Legs: view exercises' }).tap()
    const preview = page.getByRole('dialog', { name: 'Legs' })
    await expect(preview.getByText('Barbell Squat')).toBeVisible()
    await expect(preview.getByText('4 × 5–8 · rest 2:30')).toBeVisible()
    await shot(page, 'qa-day-preview')
    await preview.getByRole('button', { name: 'Close', exact: true }).tap()
    await expect(page.getByText('Workout in progress')).toHaveCount(0)

    // Start from the preview.
    await page.getByRole('button', { name: 'Legs: view exercises' }).tap()
    await preview.getByRole('button', { name: 'Start Legs' }).tap()
    await expect(page.getByRole('heading', { level: 1, name: 'Legs' })).toBeVisible()
    await exerciseCard(page, 'Barbell Squat').getByRole('button', { name: 'Complete set 1' }).tap()

    // Leave and keep it: Today offers to resume, with the ticked set intact.
    await page.getByRole('button', { name: 'Leave workout' }).tap()
    await shot(page, 'qa-leave-workout')
    await page.getByRole('button', { name: /Keep it for later/ }).tap()
    await expect(page.getByText('Workout in progress')).toBeVisible()
    await nav(page, 'Plans') // the rest of the app is usable meanwhile
    await nav(page, 'Today')
    await page.getByRole('link', { name: /Resume/ }).tap()
    await expect(exerciseCard(page, 'Barbell Squat').getByRole('button', { name: 'Undo set 1' })).toBeVisible()

    // Leave and discard: nothing saved.
    await page.getByRole('button', { name: 'Leave workout' }).tap()
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: /Discard workout/ }).last().tap()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(page.getByText('Workout in progress')).toHaveCount(0)
    await expect(page.getByText('Recent workouts')).toHaveCount(0)
  })

  test('"up next" moves through the plan days in order', async ({ page }) => {
    await waitForLibrary(page)
    await addPushPullLegsPlan(page)
    await nav(page, 'Today')
    for (const [day, exercise, next] of [
      ['Push', 'Barbell Bench Press - Medium Grip', 'Pull'],
      ['Pull', 'Pullups', 'Legs'],
      ['Legs', 'Barbell Squat', 'Push'],
    ]) {
      await expect(page.getByRole('button', { name: `${day}: view exercises` })).toContainText('Up next')
      await page.getByRole('button', { name: `Start ${day}` }).tap()
      await exerciseCard(page, exercise).getByRole('button', { name: 'Complete set 1' }).tap()
      await finishWorkout(page)
      await page.getByRole('link', { name: 'Done' }).tap()
      await expect(page.getByRole('button', { name: `${next}: view exercises` })).toContainText('Up next')
    }
    await expect(page.getByRole('heading', { name: 'Recent workouts' })).toBeVisible()
    await shot(page, 'qa-today-history')

    // Progress lists all three, newest first, and links to each summary.
    await nav(page, 'Progress')
    const history = page.getByRole('link', { name: /Legs|Pull|Push/ })
    await expect(history).toHaveCount(3)
    await expect(history.first()).toContainText('Legs')
    await history.first().tap()
    await expect(page.getByRole('heading', { level: 1, name: 'Legs' })).toBeVisible()
  })
})

test.describe('plan editing', () => {
  test('rename, reorder, remove, focus, delete day, switch active plan', async ({ page }) => {
    await waitForLibrary(page)
    await addPushPullLegsPlan(page)

    await page.getByRole('button', { name: 'Rename plan' }).tap()
    await page.getByRole('textbox', { name: 'Rename plan' }).fill('PPL v2')
    await page.getByRole('button', { name: 'Save' }).tap()
    await expect(page.getByRole('heading', { level: 1, name: 'PPL v2' })).toBeVisible()

    const push = page.getByRole('region', { name: 'Push', exact: true })
    await page.getByRole('button', { name: 'Rename day' }).tap()
    await page.getByRole('textbox', { name: 'Rename day' }).fill('Push Heavy')
    await page.getByRole('button', { name: 'Save' }).tap()
    const day = page.getByRole('region', { name: 'Push Heavy' })
    await expect(day).toBeVisible()
    await expect(push).toHaveCount(0)

    // Move the 2nd exercise up.
    const firstTwo = async () => (await day.locator('.plan-exercise .list-title').allTextContents()).slice(0, 2)
    await expect.poll(firstTwo).toEqual(['Barbell Bench Press - Medium Grip', 'Incline Dumbbell Press'])
    await day.getByRole('button', { name: /Incline Dumbbell Press/ }).tap()
    await day.getByRole('button', { name: 'Move up' }).tap()
    await expect.poll(firstTwo).toEqual(['Incline Dumbbell Press', 'Barbell Bench Press - Medium Grip'])

    // Remove it.
    await day.getByRole('button', { name: 'Remove Incline Dumbbell Press' }).tap()
    await expect(day.getByRole('button', { name: /Incline Dumbbell Press/ })).toHaveCount(0)

    // Changing focus to legs changes suggestions.
    await day.getByRole('button', { name: /Focus:/ }).tap()
    const focus = page.getByRole('dialog', { name: 'Muscles this day trains' })
    for (const m of ['Chest', 'Shoulders', 'Triceps']) await focus.getByRole('button', { name: m, exact: true }).tap()
    await focus.getByRole('button', { name: 'Quads', exact: true }).tap()
    await focus.getByRole('button', { name: 'Done' }).tap()
    await expect(day.getByText('Focus: Quads')).toBeVisible()
    await expect(day.getByRole('region', { name: 'Suggestions' })).toContainText(/Squat|Leg Press/)

    // Delete the Legs day.
    await page.getByRole('group', { name: 'Days' }).getByRole('button', { name: 'Legs', exact: true }).tap()
    page.once('dialog', (d) => d.accept())
    await page.getByRole('region', { name: 'Legs', exact: true }).getByRole('button', { name: 'Delete day' }).tap()
    await expect(page.getByRole('group', { name: 'Days' }).getByRole('button', { name: 'Legs', exact: true })).toHaveCount(0)

    // A second plan isn't active until you make it so; Today follows the active plan.
    await nav(page, 'Plans')
    await page.getByRole('button', { name: 'Use Upper / Lower template' }).tap()
    await expect(page.getByRole('button', { name: 'Make active' })).toBeVisible()
    await nav(page, 'Today')
    await expect(page.getByText('PPL v2')).toBeVisible()
    await nav(page, 'Plans')
    await page.getByRole('link', { name: /Upper \/ Lower/ }).tap()
    await page.getByRole('button', { name: 'Make active' }).tap()
    await expect(page.getByText('Active plan')).toBeVisible()
    await nav(page, 'Today')
    await expect(page.getByRole('button', { name: 'Start Upper A' })).toBeVisible()

    // Deleting a plan keeps logged workouts.
    await nav(page, 'Plans')
    await page.getByRole('link', { name: /PPL v2/ }).tap()
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Delete plan' }).tap()
    await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible()
    await expect(page.getByRole('link', { name: /PPL v2/ })).toHaveCount(0)
  })
})

test.describe('accessibility and ergonomics', () => {
  for (const colorScheme of ['light', 'dark'] as const)
    test(`no serious accessibility problems on the main screens (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await axeMainScreens(page)
    })


  test('controls are big enough to hit mid-set', async ({ page }) => {
    await waitForLibrary(page)
    await addPushPullLegsPlan(page)
    await page.getByRole('region', { name: 'Push', exact: true }).getByRole('button', { name: 'Bench Press' }).first().tap()
    expect(await tooSmall(page), 'plan editor').toEqual([])
    await page.getByRole('button', { name: 'Start Push' }).tap()
    await expect(page.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible()
    await exerciseCard(page, 'Barbell Bench Press - Medium Grip').getByRole('button', { name: 'Complete set 1' }).tap()
    expect(await tooSmall(page), 'workout').toEqual([])
  })
})

async function axeMainScreens(page: Page) {
  await waitForLibrary(page)
  await addPushPullLegsPlan(page)
  const check = async (label: string) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${label}: ${v.id} – ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)
    expect(serious, serious.join('\n')).toEqual([])
  }
  await check('plan editor')
  for (const name of ['Today', 'Exercises', 'Progress', 'Settings']) {
    await nav(page, name)
    await check(name)
  }
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start Push' }).tap()
  await exerciseCard(page, 'Barbell Bench Press - Medium Grip').getByRole('button', { name: 'Complete set 1' }).tap()
  await check('workout')
}

/** Controls under 36px tall or 32px wide: too fiddly to hit with a thumb between sets. */
function tooSmall(page: Page) {
  return page.evaluate(() =>
      Array.from(document.querySelectorAll("button, a, input, select"))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0)
        .filter(({ r }) => r.height < 36 || r.width < 32)
        .map(({ el, r }) => `${el.tagName} "${el.getAttribute('aria-label') ?? el.textContent?.trim()}" ${Math.round(r.width)}×${Math.round(r.height)}`),
  )
}

test.describe('speed', () => {
  test('loads fast on a mid-range phone over 4G, and instantly once cached', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (4 * 1024 * 1024) / 8,
      uploadThroughput: (1 * 1024 * 1024) / 8,
    })

    const timeToInteractive = async () => {
      const start = Date.now()
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Start empty workout' })).toBeVisible()
      return Date.now() - start
    }

    const first = await timeToInteractive()
    await page.evaluate(() => navigator.serviceWorker.ready)
    const cached = await timeToInteractive()
    console.log(`First visit: ${first}ms, repeat visit (cached): ${cached}ms`)
    expect(first).toBeLessThan(4000)
    expect(cached).toBeLessThan(1500)
  })
})
