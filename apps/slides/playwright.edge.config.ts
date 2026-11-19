import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config.ts'

/**
 * The same tests in Microsoft Edge, on a machine that has it installed (CI runs Chrome and
 * Firefox only). `npx playwright test -c playwright.edge.config.ts e2e/present.spec.ts`
 */
export default defineConfig({ ...base, projects: [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } }] })
