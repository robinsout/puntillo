import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

// Chromium runs every scenario. The other engines run what differs between engines: layout and
// geometry (titles with "px wide screen") and, on desktop, keyboard and focus. The rule is in the
// titles, so a new test joins the right group by being named like its neighbours.
const LAYOUT = /px wide screen/
const KEYBOARD_AND_FOCUS = /keyboard|focus|Tab|Esc/

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  forbidOnly: !!process.env.CI,
  /* One retry on CI absorbs a runner glitch without hiding flaky tests. */
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    /* Fail an action on a missing element fast instead of waiting for the whole test timeout. */
    actionTimeout: 10 * 1000,
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
    trace: 'on-first-retry',
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
      },
      grep: [LAYOUT, KEYBOARD_AND_FOCUS],
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      },
      grep: [LAYOUT, KEYBOARD_AND_FOCUS],
    },
    /* Spec §17: verify on mobile as well as desktop. */
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
      },
      grep: LAYOUT,
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
      },
      grep: LAYOUT,
    },
  ],
  webServer: {
    command: process.env.CI ? 'npm run preview' : 'npm run dev',
    port: process.env.CI ? 4173 : 5173,
    reuseExistingServer: !process.env.CI,
  },
})
