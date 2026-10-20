import type { Page } from '@playwright/test'
import { SUPABASE, expect, test } from './fixtures'
import { confirmSheet, nav, openProfile, shot, waitForLibrary } from './helpers'

// The social functions (supabase/migrations/20261022090000_friends.sql and 20261024090000_social.sql) are
// answered here from a small in-memory state; their SQL is tested against Postgres separately.

interface Row {
  id: string
  status: 'pending' | 'accepted'
  incoming: boolean
  friend_id: string | null
  name: string
  email: string
  avatar: string | null
}

const JO = 'jo-user'
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function mockSocial(page: Page, jo: { share_workouts: boolean; share_prs: boolean } = { share_workouts: true, share_prs: true }) {
  const state = {
    profile: null as null | { display_name: string | null; avatar: string | null; share_workouts: boolean; share_prs: boolean },
    saves: [] as Record<string, unknown>[],
    rows: [{ id: 'jo', status: 'pending', incoming: true, friend_id: null, name: 'Jo', email: 'jo@example.com', avatar: null }] as Row[],
    sent: [] as string[],
  }
  const joAccepted = () => state.rows.some((r) => r.id === 'jo' && r.status === 'accepted')
  await page.route(`${SUPABASE}/rest/v1/profiles**`, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: state.profile ? [state.profile] : [] })
    const body = route.request().postDataJSON()
    state.saves.push(body)
    state.profile = { display_name: null, avatar: null, share_workouts: true, share_prs: true, ...state.profile, ...body }
    return route.fulfill({ status: 201, json: [] })
  })
  await page.route(`${SUPABASE}/rest/v1/friendships**`, (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const email = req.postDataJSON().addressee_email
      state.sent.push(email)
      state.rows.push({ id: email, status: 'pending', incoming: false, friend_id: null, name: email, email, avatar: null })
    } else if (req.method() === 'DELETE') {
      const id = new URL(req.url()).searchParams.get('id')!.replace('eq.', '')
      state.rows = state.rows.filter((r) => r.id !== id)
    }
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, body: '' })
  })
  await page.route(`${SUPABASE}/rest/v1/rpc/friend_list`, (route) => route.fulfill({ json: state.rows }))
  await page.route(`${SUPABASE}/rest/v1/rpc/accept_friend`, (route) => {
    const id = route.request().postDataJSON().request_id
    state.rows = state.rows.map((r) => (r.id === id ? { ...r, status: 'accepted', friend_id: JO } : r))
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route(`${SUPABASE}/rest/v1/rpc/friend_feed`, (route) =>
    route.fulfill({
      json:
        joAccepted() && jo.share_workouts
          ? [
              {
                friend_id: JO,
                friend_name: 'Jo',
                friend_avatar: null,
                session_id: 'w1',
                session_name: 'Legs',
                started_at: daysAgo(1),
                ended_at: daysAgo(1),
                set_count: 14,
                prs: jo.share_prs ? [{ exercise_id: 'Barbell_Squat', weight_kg: 120, reps: 5, duration_sec: null, prs: ['max_weight'] }] : [],
              },
            ]
          : [],
    }),
  )
  await page.route(`${SUPABASE}/rest/v1/rpc/friend_leaderboard`, (route) =>
    route.fulfill({
      json: [
        { user_id: 'me', name: state.profile?.display_name ?? 'lewis@example.com', avatar: state.profile?.avatar ?? null, is_me: true, workouts: 1, sets: 12 },
        ...(joAccepted() && jo.share_workouts ? [{ user_id: JO, name: 'Jo', avatar: null, is_me: false, workouts: 3, sets: 40 }] : []),
      ],
    }),
  )
  await page.route(`${SUPABASE}/rest/v1/rpc/friend_profile`, (route) =>
    route.fulfill({
      json: joAccepted()
        ? {
            name: 'Jo',
            avatar: null,
            ...jo,
            workout_starts: jo.share_workouts ? [daysAgo(1), daysAgo(8), daysAgo(15)] : null,
            best_lifts: jo.share_prs
              ? [
                  { exercise_id: 'Barbell_Squat', weight_kg: 120, reps: 5, at: daysAgo(1) },
                  { exercise_id: 'Barbell_Deadlift', weight_kg: 150, reps: 3, at: daysAgo(8) },
                ]
              : null,
            recent_prs: jo.share_prs ? [{ exercise_id: 'Barbell_Squat', weight_kg: 120, reps: 5, duration_sec: null, prs: ['max_weight'], at: daysAgo(1) }] : null,
          }
        : null,
    }),
  )
  return state
}

// A 4×3 red PNG, standing in for a photo from the camera roll.
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==', 'base64')

test('profile: name and photo from the header, what friends see, and Settings', async ({ page }) => {
  const state = await mockSocial(page)
  await waitForLibrary(page)
  await nav(page, 'Today')
  await openProfile(page)
  await expect(page.getByRole('region', { name: 'You' })).toContainText('No name yet')

  await page.getByRole('button', { name: 'Edit name and photo' }).tap()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PHOTO })
  await expect(sheet.getByRole('button', { name: 'Remove photo' })).toBeVisible()
  await sheet.getByLabel('Name').fill('Lewis')
  await shot(page, 'p4-profile-edit')
  await sheet.getByRole('button', { name: 'Save' }).tap()
  await expect(page.getByRole('region', { name: 'You' })).toContainText('Lewis')
  // Saves are optimistic (the page updates first), so wait for the request rather than assume it has landed.
  await expect.poll(() => state.saves[0]).toMatchObject({ display_name: 'Lewis', avatar: expect.stringMatching(/^data:image\/jpeg;base64,/) })

  // What friends see is saved to the server.
  await page.getByRole('checkbox', { name: /Your PRs/ }).uncheck()
  await expect(page.getByRole('checkbox', { name: /Your PRs/ })).not.toBeChecked()
  await expect.poll(() => state.saves.at(-1)).toMatchObject({ share_prs: false })
  await expect(page.getByRole('region', { name: 'Account & backup' })).toContainText('Signed in as lewis@example.com')
  await shot(page, 'p4-profile')

  // Settings is a row in Profile; the header photo is on every tab and shows the new photo.
  await page.getByRole('link', { name: 'Settings' }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  for (const tab of ['Today', 'Plans', 'Exercises', 'Progress', 'Social']) {
    await nav(page, tab)
    await expect(page.getByRole('link', { name: 'Profile' }).locator('img')).toBeVisible()
  }
})

test('social: requests, the weekly leaderboard, friends’ workouts, and a friend’s profile', async ({ page }) => {
  const state = await mockSocial(page)
  await waitForLibrary(page)
  await nav(page, 'Social')
  await expect(page.getByRole('heading', { level: 1, name: 'Social' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Add your name and photo/ })).toBeVisible()

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
  const board = page.getByRole('list', { name: 'This week’s leaderboard' })
  await expect(board.getByRole('listitem').first()).toContainText('Jo')
  await expect(board.getByRole('listitem').first()).toContainText('3 workouts · 40 sets')
  await expect(board.getByRole('listitem').nth(1)).toContainText('You')
  const feed = page.getByRole('list', { name: 'Friends’ workouts' })
  await expect(feed).toContainText('Jo · Legs')
  await expect(feed).toContainText('14 sets')
  await expect(feed).toContainText('Barbell Squat: 120kg × 5')
  await expect(feed).toContainText('Heaviest weight')
  await shot(page, 'p4-social')

  // Jo's profile: stats, best lifts by est. 1RM, PRs and workouts; remove from there.
  await page.getByRole('list', { name: 'Friends', exact: true }).getByRole('link', { name: /Jo/ }).tap()
  await expect(page.getByRole('heading', { level: 1, name: 'Jo' })).toBeVisible()
  const stats = page.getByRole('region', { name: 'Their stats' })
  await expect(stats).toContainText('Week streak')
  await expect(stats).toContainText('3')
  const best = page.getByRole('list', { name: 'Best lifts' })
  await expect(best.getByRole('listitem').first()).toContainText('Barbell Deadlift') // 150 × 3 beats 120 × 5
  await expect(page.getByRole('list', { name: 'Recent PRs' })).toContainText('Barbell Squat: 120kg × 5')
  await shot(page, 'p4-friend')

  await page.getByRole('button', { name: 'Remove friend' }).tap()
  await confirmSheet(page, 'Remove friend')
  await expect(page.getByRole('heading', { level: 1, name: 'Social' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'This week’s leaderboard' })).toHaveCount(0)
})

test('social: a friend who shares nothing', async ({ page }) => {
  const state = await mockSocial(page, { share_workouts: false, share_prs: false })
  state.rows = [{ id: 'jo', status: 'accepted', incoming: false, friend_id: JO, name: 'Jo', email: 'jo@example.com', avatar: null }]
  await waitForLibrary(page)
  await page.goto(`/social/${JO}`)
  await expect(page.getByText('Jo doesn’t share workouts.')).toBeVisible()
  await expect(page.getByText('Jo doesn’t share PRs.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Best lifts' })).toHaveCount(0)
})

test('social: says so when offline', async ({ page, context }) => {
  await waitForLibrary(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.goto('/social')
  await expect(page.getByRole('alert')).toContainText('You’re offline')
})
