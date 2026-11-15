import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Automated accessibility scan (axe-core, WCAG 2.1 A and AA) of every screen a student sees:
 * the page, each menu, each dialog, the find bar, and a document with every kind of content.
 */

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })

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

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
})

test('the page, with a document using every kind of content', async ({ page }) => {
  await scan(page, 'a blank document')
  await page.evaluate(() => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    window.__openWriter!.commands.setContent(
      `<p data-type="title">Title</p><h1>Heading</h1><p>Text with <strong>bold</strong>, <a href="https://example.com">a link</a>,
       <mark data-color="#ffff00">highlight</mark> and <span style="color: #c00000">color</span>.</p>
       <ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol><blockquote><p>quote</p></blockquote>
       <table><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>
       <img src="${png}" alt="dot" width="40" height="40"><div data-type="page-break"></div><p>End</p>`,
      { emitUpdate: true },
    )
  })
  await scan(page, 'a document with every kind of content')
  // The table menu appears with the cursor in a table.
  await page.locator('.doc td').first().click()
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toBeVisible()
  await scan(page, 'the page with the cursor in a table')
})

for (const menu of ['File', 'Insert', 'Format', 'Page', 'Export']) {
  test(`the ${menu} menu`, async ({ page }) => {
    await page.getByRole('button', { name: menu, exact: true }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await scan(page, `the ${menu} menu`)
  })
}

test('the color and highlight pickers', async ({ page }) => {
  await page.getByRole('button', { name: 'Text color' }).click()
  await scan(page, 'the text color picker')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Highlight' }).click()
  await scan(page, 'the highlight picker')
})

const dialogs: [string, string, string][] = [
  ['Insert', 'Table…', 'Insert table'],
  ['Insert', 'Link…', 'Add link'],
  ['Page', 'Page setup…', 'Page setup'],
  ['Page', 'Header, footer and page numbers…', 'Header, footer and page numbers'],
  ['File', 'Print…', 'Print'],
  ['File', 'New from template…', 'New from template'],
]
for (const [menu, item, title] of dialogs) {
  test(`the ${title} dialog`, async ({ page }) => {
    await page.getByRole('button', { name: menu, exact: true }).click()
    await page.getByRole('menuitem', { name: item, exact: true }).click()
    await expect(page.getByRole('dialog', { name: title })).toBeVisible()
    await scan(page, `the ${title} dialog`)
  })
}

test('the find and replace bar', async ({ page }) => {
  await page.keyboard.type('find me')
  await page.keyboard.press('ControlOrMeta+h')
  await page.keyboard.type('find')
  await scan(page, 'the find and replace bar')
})
