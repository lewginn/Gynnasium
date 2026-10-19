import type { Page } from '@playwright/test'
import { SUPABASE, expect, test } from './fixtures'
import { confirmSheet, nav, shot, waitForLibrary } from './helpers'

// The friends functions (supabase/migrations/20261022090000_friends.sql) are answered here from a small
// in-memory state; their SQL is tested against Postgres separately.

interface Row {
  id: string
  status: 'pending' | 'accepted'
  incoming: boolean
  name: string
  email: string
}

async function mockFriends(page: Page) {
  const state = {
    name: null as string | null,
    rows: [{ id: 'jo', status: 'pending', incoming: true, name: 'Jo', email: 'jo@example.com' }] as Row[],
    sent: [] as string[],
  }
  await page.route(`${SUPABASE}/rest/v1/profiles**`, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: state.name ? [{ display_name: state.name }] : [] })
    state.name = route.request().postDataJSON().display_name
    return route.fulfill({ status: 201, json: [] })
  })
  await page.route(`${SUPABASE}/rest/v1/friendships**`, (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const email = req.postDataJSON().addressee_email
      state.sent.push(email)
      state.rows.push({ id: email, status: 'pending', incoming: false, name: email, email })
    } else if (req.method() === 'DELETE') {
      const id = new URL(req.url()).searchParams.get('id')!.replace('eq.', '')
      state.rows = state.rows.filter((r) => r.id !== id)
    }
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, body: '' })
  })
  await page.route(`${SUPABASE}/rest/v1/rpc/friend_list`, (route) => route.fulfill({ json: state.rows }))
  await page.route(`${SUPABASE}/rest/v1/rpc/accept_friend`, (route) => {
    const id = route.request().postDataJSON().request_id
    state.rows = state.rows.map((r) => (r.id === id ? { ...r, status: 'accepted' } : r))
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route(`${SUPABASE}/rest/v1/rpc/friend_feed`, (route) =>
    route.fulfill({
      json: state.rows.some((r) => r.id === 'jo' && r.status === 'accepted')
        ? [
            {
              friend_id: 'jo-user',
              friend_name: 'Jo',
              session_id: 'w1',
              session_name: 'Legs',
              started_at: new Date(Date.now() - 86_400_000).toISOString(),
              ended_at: new Date().toISOString(),
              set_count: 14,
              prs: [{ exercise_id: 'Barbell_Squat', weight_kg: 120, reps: 5, duration_sec: null, prs: ['max_weight'] }],
            },
          ]
        : [],
    }),
  )
  return state
}

test('friends: name yourself, send and accept requests, see their workouts', async ({ page }) => {
  const state = await mockFriends(page)
  await waitForLibrary(page)
  await nav(page, 'Progress')
  await page.getByRole('link', { name: 'Friends' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Friends' })).toBeVisible()

  const nameForm = page.getByRole('form', { name: 'Your name' })
  await nameForm.getByLabel('Your name').fill('Lewis')
  await nameForm.getByRole('button', { name: 'Save name' }).tap()
  await expect(page.getByText('Friends see you as Lewis')).toBeVisible()
  expect(state.name).toBe('Lewis')

  // Your own email is caught before anything is sent.
  const add = page.getByRole('form', { name: 'Add a friend' })
  await add.getByLabel('Add a friend').fill('lewis@example.com')
  await add.getByRole('button', { name: 'Send request' }).tap()
  await expect(add.getByRole('alert')).toContainText('your own email')
  await add.getByLabel('Add a friend').fill('Sam@Example.com')
  await add.getByRole('button', { name: 'Send request' }).tap()
  await expect(page.getByText('Waiting for them to accept')).toBeVisible()
  expect(state.sent).toEqual(['sam@example.com'])

  await page.getByRole('button', { name: 'Accept Jo' }).tap()
  await expect(page.getByRole('button', { name: 'Remove Jo' })).toBeVisible()
  const feed = page.getByRole('list', { name: 'Friends’ workouts' })
  await expect(feed).toContainText('Jo · Legs')
  await expect(feed).toContainText('14 sets')
  await expect(feed).toContainText('Barbell Squat: 120kg × 5')
  await expect(feed).toContainText('Heaviest weight')
  await shot(page, 'p4-friends')

  await page.getByRole('button', { name: 'Remove Jo' }).tap()
  await confirmSheet(page, 'Remove friend')
  await expect(page.getByRole('button', { name: 'Remove Jo' })).toHaveCount(0)
})

test('friends: says so when offline', async ({ page, context }) => {
  await waitForLibrary(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.goto('/friends')
  await expect(page.getByRole('alert')).toContainText('You’re offline')
})
