import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4176', trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'npx tsc -b && npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4176 --strictPort',
    url: 'http://localhost:4176',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
