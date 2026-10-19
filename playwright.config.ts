import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // The owner uses an iPhone. Playwright's iPhone profile defaults to WebKit; Chromium is what CI installs.
      name: 'iphone',
      use: {
        ...devices['iPhone 15'],
        browserName: 'chromium',
        // Cloud dev containers ship a pre-installed Chromium; CI uses Playwright's own download.
        launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
      },
    },
  ],
  // Tests run against the production build so the service worker (offline mode) is exercised.
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    // A fake Supabase project: tests intercept its requests (see e2e/sync.spec.ts), so nothing leaves the browser.
    env: { VITE_SUPABASE_URL: 'https://gynnasium-test.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
