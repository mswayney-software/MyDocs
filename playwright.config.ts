import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4174', trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /perf\.spec\.ts/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /perf\.spec\.ts/ },
    // Timing tests run last, alone, so other tests don't compete for the CPU they measure.
    { name: 'perf', use: { ...devices['Desktop Chrome'] }, testMatch: /perf\.spec\.ts/, dependencies: ['chromium', 'firefox'] },
  ],
  webServer: {
    command: 'npx tsc -b && npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
