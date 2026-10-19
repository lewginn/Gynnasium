import type { Page } from '@playwright/test'
import { SUPABASE, TEST_USER, expect, fakeJwt, signInAs, test, userJson } from './fixtures'
import { addExerciseToWorkout, confirmSheet, exerciseCard, finishWorkout, nav, setInput, shot, typeInto, waitForLibrary } from './helpers'

// Login and backup against a mocked Supabase: these exercise the real app code and check the exact requests it sends.

interface Recorded {
  otp: { email: string; redirect?: string }[]
  upserts: Record<string, Record<string, unknown>[]>
  settings: Record<string, unknown>[]
}

/** Records writes and serves `remoteRows` once (as if new on the server). Registered after the fixture's defaults, so it wins. */
async function recordSupabase(page: Page, remoteRows: Record<string, unknown[]> = {}): Promise<Recorded> {
  const rec: Recorded = { otp: [], upserts: {}, settings: [] }
  await page.route(`${SUPABASE}/auth/v1/otp**`, async (route) => {
    rec.otp.push({ email: route.request().postDataJSON().email, redirect: new URL(route.request().url()).searchParams.get('redirect_to') ?? undefined })
    return route.fulfill({ status: 200, json: {} })
  })
  await page.route(`${SUPABASE}/rest/v1/**`, async (route) => {
    const req = route.request()
    const table = new URL(req.url()).pathname.split('/').pop()!
    if (req.method() === 'GET') {
      const rows = remoteRows[table] ?? []
      remoteRows[table] = []
      return route.fulfill({ status: 200, json: rows })
    }
    const body = req.postDataJSON()
    if (table === 'user_settings') rec.settings.push(body)
    else (rec.upserts[table] ??= []).push(...(Array.isArray(body) ? body : [body]))
    return route.fulfill({ status: 201, json: [] })
  })
  return rec
}

test.describe('signed out', () => {
  test.use({ signedIn: false })

  test('the login screen is all you can reach', async ({ page }) => {
    await page.goto('/plans')
    await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Plans' })).toHaveCount(0)
    await shot(page, 'p2-login')
  })

  test('request a login link', async ({ page }) => {
    const rec = await recordSupabase(page)
    await page.goto('/')
    await page.getByLabel('Email').fill('lewis@example.com')
    await page.getByRole('button', { name: 'Email me a login link' }).tap()
    await expect(page.getByText('Check your email')).toBeVisible()
    await expect(page.getByText('lewis@example.com')).toBeVisible()
    expect(rec.otp).toEqual([{ email: 'lewis@example.com', redirect: 'http://localhost:4173' }])
  })

  test('opening the login link signs you in', async ({ page }) => {
    await recordSupabase(page)
    const { token, exp } = fakeJwt()
    await page.goto(`/#access_token=${token}&expires_at=${exp}&expires_in=3600&refresh_token=r&token_type=bearer&type=magiclink`)
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
    await nav(page, 'Settings')
    await expect(page.getByRole('region', { name: 'Account & backup' })).toContainText(`Signed in as ${TEST_USER.email}`)
  })

  test('an expired link says so', async ({ page }) => {
    await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    await expect(page.getByRole('alert')).toContainText('Email link is invalid or has expired')
  })
})

test('signed in: opens offline without asking you to sign in again', async ({ page, context }) => {
  await waitForLibrary(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Sign in' })).toHaveCount(0)
})

test('signed in: an expired login with no signal still opens the app', async ({ page, context }) => {
  await page.clock.install()
  await waitForLibrary(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.clock.fastForward(3 * 3600_000) // the 1-hour login has expired and can't be refreshed offline
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await page.clock.fastForward(5_000)
  await expect(page.getByRole('form', { name: 'Sign in' })).toHaveCount(0)
  await nav(page, 'Settings')
  await expect(page.getByRole('region', { name: 'Account & backup' })).toContainText(/Offline|Backed up|Not backed up/)
})

test('a finished workout is backed up with the right fields', async ({ page }) => {
  const rec = await recordSupabase(page)
  await waitForLibrary(page)
  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start empty workout' }).tap()
  await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
  const squat = exerciseCard(page, 'Barbell Squat')
  await typeInto(setInput(squat, 1, 'weight'), '100')
  await squat.getByRole('button', { name: 'Complete set 1' }).tap()
  await finishWorkout(page)

  await expect.poll(() => rec.upserts.set_logs?.length ?? 0).toBeGreaterThan(0)
  const done = rec.upserts.set_logs.filter((s) => s.completed_at)
  expect(done).toHaveLength(1)
  expect(done[0]).toMatchObject({ exercise_id: 'Barbell_Squat', weight_kg: 100, reps: 10, set_type: 'working', prs: [], deleted_at: null })
  expect(Object.keys(done[0])).not.toContain('user_id') // set by the server from the login
  expect(rec.upserts.workout_sessions.at(-1)!.ended_at).toBeTruthy()

  await nav(page, 'Settings')
  await expect(page.getByRole('region', { name: 'Account & backup' })).toContainText(/Backed up (just now|\d+ min ago)/)
  await shot(page, 'p2-signed-in')
})

test('data from another device is pulled in', async ({ page }) => {
  const now = new Date().toISOString()
  await recordSupabase(page, {
    plans: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'From my laptop', is_active: true, created_by: 'manual', goal: null, updated_at: now, deleted_at: null, server_updated_at: now, user_id: TEST_USER.id }],
    body_metrics: [{ id: 'aaaaaaaa-0000-4000-8000-000000000002', type: 'bodyweight', value: 81.5, date: '2026-10-01', source: 'manual', updated_at: now, deleted_at: null, server_updated_at: now, user_id: TEST_USER.id }],
  })
  await page.goto('/plans')
  await expect(page.getByRole('link', { name: /From my laptop/ })).toBeVisible()
  await nav(page, 'Progress')
  await expect(page.getByRole('region', { name: 'Body' })).toContainText('81.5')
})

test('settings are backed up when changed', async ({ page }) => {
  const rec = await recordSupabase(page)
  await page.goto('/settings')
  await expect(page.getByRole('region', { name: 'Account & backup' })).toContainText('Signed in')
  await page.getByRole('radio', { name: 'lb' }).tap()
  await page.getByRole('button', { name: 'Back up now' }).tap()
  await expect.poll(() => rec.settings.at(-1)).toMatchObject({ units: 'lb', user_id: TEST_USER.id })
})

test('sign out returns to the login screen; signing back in keeps your data', async ({ page }) => {
  await waitForLibrary(page)
  await nav(page, 'Progress')
  await page.getByRole('region', { name: 'Body' }).getByRole('button', { name: 'Log' }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).tap()
  await nav(page, 'Settings')
  await page.getByRole('button', { name: 'Sign out' }).tap()
  await confirmSheet(page, 'Sign out')
  await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()

  await page.reload() // the fixture signs the same account back in
  await nav(page, 'Progress')
  await expect(page.getByRole('region', { name: 'Body' })).toContainText('75.0')
})

test("someone else signing in on this phone doesn't see your data", async ({ page, context }) => {
  await waitForLibrary(page)
  await nav(page, 'Plans')
  await page.getByRole('button', { name: 'Use Push / Pull / Legs template' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Push / Pull / Legs' })).toBeVisible()
  await nav(page, 'Settings')
  await page.getByRole('button', { name: 'Sign out' }).tap()
  await confirmSheet(page, 'Sign out')
  await expect(page.getByRole('form', { name: 'Sign in' })).toBeVisible()

  // A friend signs in on the same phone.
  const friend = { id: '22222222-2222-4222-8222-222222222222', email: 'friend@example.com' }
  const other = await context.newPage()
  await other.route(`${SUPABASE}/**`, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, json: new URL(route.request().url()).pathname.endsWith('/user') ? userJson(friend) : [] })
      : route.fulfill({ status: 201, json: [] }),
  )
  await signInAs(other, friend)
  await other.goto('/plans')
  await expect(other.getByText(/No plans|Start from a template/).first()).toBeVisible()
  await expect(other.getByRole('link', { name: /Push \/ Pull \/ Legs/ })).toHaveCount(0)
  await other.goto('/settings')
  await expect(other.getByRole('region', { name: 'Account & backup' })).toContainText(friend.email)
})
