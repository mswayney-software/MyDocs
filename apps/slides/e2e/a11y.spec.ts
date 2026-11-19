import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Each accessibility scan takes a few seconds in Firefox; a test with several needs more than 30.
test.describe.configure({ timeout: 90_000 })

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

test('editing text, a selected box, the slide menu, and the link dialog', async ({ page }) => {
  await page.goto('/')
  const live = page.locator('.el-live .ProseMirror')
  await expect(live).toBeFocused()
  await page.keyboard.type('Cell Division')
  await scan(page, 'the slide while typing in the title, with the text tools showing')

  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog', { name: 'Add link' })).toBeVisible()
  await scan(page, 'the link dialog')
  await page.keyboard.press('Escape')

  await live.press('Escape')
  await page.keyboard.press('ControlOrMeta+m')
  await page.locator('.stage').focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('.sel-box')).toHaveCount(1)
  await scan(page, 'a selected box with its handles and box tools')

  await page.locator('.strip-thumb').first().click({ button: 'right' })
  await expect(page.getByRole('menu', { name: 'Slide' })).toBeVisible()
  await scan(page, 'the slide menu in the strip')
})

for (const theme of ['light', 'dark'] as const) {
  test(`the empty shell (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('mydocs:theme', t), theme)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Untitled deck' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await scan(page, `the empty shell in ${theme} mode`)
  })
}
