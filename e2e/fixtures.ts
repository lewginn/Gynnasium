import { test as base, expect, type Page } from '@playwright/test'

// Signing in is required, so every test starts signed in (set `signedIn: false` to test the login screen).
// The test build points at a fake Supabase project; every request to it is answered here, so nothing leaves the browser.

export const SUPABASE = 'https://gynnasium-test.supabase.co'
export const TEST_USER = { id: '11111111-1111-4111-8111-111111111111', email: 'lewis@example.com' }

export function userJson(user = TEST_USER) {
  return { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
}

export function fakeJwt(user = TEST_USER) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return { token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, exp, role: 'authenticated' })}.sig`, exp }
}

/** Puts a session where supabase-js keeps it, as if the login link had been opened on this phone. */
export async function signInAs(page: Page, user = TEST_USER) {
  const { token, exp } = fakeJwt(user)
  const session = { access_token: token, refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: userJson(user) }
  await page.addInitScript(
    ([s, a]) => {
      localStorage.setItem('sb-gynnasium-test-auth-token', s)
      localStorage.setItem('gynnasium.account', a)
    },
    [JSON.stringify(session), JSON.stringify(user)],
  )
}

/** Answers any Supabase request: an empty table for reads, success for writes, the test user, token refreshes. */
export async function mockSupabaseDefaults(page: Page) {
  await page.route(`${SUPABASE}/**`, (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (path.endsWith('/auth/v1/user')) return route.fulfill({ status: 200, json: userJson() })
    // Token refresh (an hour on, or when a test fast-forwards the clock): hand out a fresh session.
    if (path.endsWith('/auth/v1/token')) {
      const { token } = fakeJwt()
      return route.fulfill({ status: 200, json: { access_token: token, refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600, user: userJson() } })
    }
    if (req.method() === 'GET') return route.fulfill({ status: 200, json: [] })
    return route.fulfill({ status: 201, json: [] })
  })
}

export const test = base.extend<{ signedIn: boolean }>({
  signedIn: [true, { option: true }],
  page: async ({ page, signedIn }, provide) => {
    await mockSupabaseDefaults(page)
    if (signedIn) await signInAs(page)
    await provide(page)
  },
})

export { expect }
