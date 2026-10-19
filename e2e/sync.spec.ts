import { expect, test, type Page } from '@playwright/test'
import { addExerciseToWorkout, exerciseCard, finishWorkout, nav, setInput, shot, typeInto, waitForLibrary } from './helpers'

// Sign-in and backup against a mocked Supabase (the test build points at a fake project; every request
// to it is answered here), so these check the real app code and the exact requests it sends.

const SUPABASE = 'https://gynnasium-test.supabase.co'
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'lewis@example.com' }

interface Recorded {
  otp: { email: string; redirect?: string }[]
  upserts: Record<string, Record<string, unknown>[]>
  settings: Record<string, unknown>[]
}

async function mockSupabase(page: Page, remoteRows: Record<string, unknown[]> = {}): Promise<Recorded> {
  const rec: Recorded = { otp: [], upserts: {}, settings: [] }
  await page.route(`${SUPABASE}/auth/v1/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/otp')) {
      const body = route.request().postDataJSON()
      rec.otp.push({ email: body.email, redirect: url.searchParams.get('redirect_to') ?? undefined })
      return route.fulfill({ status: 200, json: {} })
    }
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 })
    return route.fulfill({ status: 200, json: {} })
  })
  await page.route(`${SUPABASE}/rest/v1/**`, async (route) => {
    const req = route.request()
    const table = new URL(req.url()).pathname.split('/').pop()!
    if (req.method() === 'GET') {
      // Serve rows once (as if they were new), then nothing new on later pulls.
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

/** Puts a signed-in session where supabase-js keeps it, as if the login link had been opened. */
async function signInAs(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, email: USER.email, exp, role: 'authenticated' })}.sig`
  const session = {
    access_token: jwt,
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: { id: USER.id, email: USER.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  }
  await page.addInitScript((value) => localStorage.setItem('sb-gynnasium-test-auth-token', value), JSON.stringify(session))
}

test('sign in with an email link', async ({ page }) => {
  const rec = await mockSupabase(page)
  await page.goto('/settings')
  const account = page.getByRole('region', { name: 'Account & backup' })
  await account.getByLabel('Email').fill('lewis@example.com')
  await account.getByRole('button', { name: 'Email me a login link' }).tap()
  await expect(account.getByText('Check your email')).toBeVisible()
  await expect(account).toContainText('lewis@example.com')
  expect(rec.otp).toEqual([{ email: 'lewis@example.com', redirect: 'http://localhost:4173' }])
  await shot(page, 'p2-login-sent')
})

test('signed in: a finished workout is backed up with the right fields', async ({ page }) => {
  await signInAs(page)
  const rec = await mockSupabase(page)
  await waitForLibrary(page)
  await nav(page, 'Settings')
  const account = page.getByRole('region', { name: 'Account & backup' })
  await expect(account).toContainText(`Signed in as ${USER.email}`)

  await nav(page, 'Today')
  await page.getByRole('button', { name: 'Start empty workout' }).tap()
  await addExerciseToWorkout(page, 'barbell squat', /^Barbell Squat/)
  const squat = exerciseCard(page, 'Barbell Squat')
  await typeInto(setInput(squat, 1, 'weight'), '100')
  await squat.getByRole('button', { name: 'Complete set 1' }).tap()
  await finishWorkout(page)

  // Finishing triggers a backup.
  await expect.poll(() => rec.upserts.set_logs?.length ?? 0).toBeGreaterThan(0)
  const done = rec.upserts.set_logs.filter((s) => s.completed_at)
  expect(done).toHaveLength(1)
  expect(done[0]).toMatchObject({ exercise_id: 'Barbell_Squat', weight_kg: 100, reps: 10, set_type: 'working', prs: [], deleted_at: null })
  expect(Object.keys(done[0])).not.toContain('user_id') // set by the server from the login
  expect(rec.upserts.workout_sessions.at(-1)).toMatchObject({ name: 'Workout' })
  expect(rec.upserts.workout_sessions.at(-1)!.ended_at).toBeTruthy()

  await nav(page, 'Settings')
  await expect(account).toContainText(/Backed up (just now|\d+ min ago)/)
  await shot(page, 'p2-signed-in')
})

test('signed in: data from another device is pulled in', async ({ page }) => {
  await signInAs(page)
  const now = new Date().toISOString()
  await mockSupabase(page, {
    plans: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'From my laptop', is_active: true, created_by: 'manual', goal: null, updated_at: now, deleted_at: null, server_updated_at: now, user_id: USER.id }],
    body_metrics: [{ id: 'aaaaaaaa-0000-4000-8000-000000000002', type: 'bodyweight', value: 81.5, date: '2026-10-01', source: 'manual', updated_at: now, deleted_at: null, server_updated_at: now, user_id: USER.id }],
  })
  await page.goto('/plans')
  await expect(page.getByRole('link', { name: /From my laptop/ })).toBeVisible()
  await nav(page, 'Progress')
  await expect(page.getByRole('region', { name: 'Body' })).toContainText('81.5')
})

test('settings are backed up when changed', async ({ page }) => {
  await signInAs(page)
  const rec = await mockSupabase(page)
  await page.goto('/settings')
  await expect(page.getByRole('region', { name: 'Account & backup' })).toContainText('Signed in')
  await page.getByRole('radio', { name: 'lb' }).tap()
  await page.getByRole('button', { name: 'Back up now' }).tap()
  await expect.poll(() => rec.settings.at(-1)).toMatchObject({ units: 'lb', user_id: USER.id })
})

test('signing out keeps everything on the phone', async ({ page }) => {
  await signInAs(page)
  await mockSupabase(page)
  await waitForLibrary(page)
  await nav(page, 'Progress')
  await page.getByRole('region', { name: 'Body' }).getByRole('button', { name: 'Log' }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).tap()
  await nav(page, 'Settings')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Sign out' }).tap()
  await expect(page.getByRole('button', { name: 'Email me a login link' })).toBeVisible()
  await nav(page, 'Progress')
  await expect(page.getByRole('region', { name: 'Body' })).toContainText('75.0')
})
