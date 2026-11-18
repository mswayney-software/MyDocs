import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** Automated accessibility scan (axe-core, WCAG 2.1 A and AA). Grows with every screen added. */
async function scan(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()
  const problems = results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')}: ${n.failureSummary?.split('\n')[1]?.trim()}`),
  }))
  expect(problems, `accessibility problems in ${what}`).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test(`the empty shell (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('mydocs:theme', t), theme)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Untitled deck' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await scan(page, `the empty shell in ${theme} mode`)
  })
}
