import { expect, test, type Page } from '@playwright/test'

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })
const json = (page: Page) => page.evaluate(() => window.__openWriter!.getJSON())

test('types and formats a school paper, and the document survives a JSON round trip', async ({ page }) => {
  await page.goto('/')
  await expect(doc(page)).toBeFocused()

  // Title, then a heading. Enter after each returns to normal text.
  await page.getByLabel('Paragraph style').selectOption('title')
  await page.keyboard.type('My Paper')
  await page.keyboard.press('Enter')
  await page.getByLabel('Paragraph style').selectOption('h1')
  await page.keyboard.type('Introduction')
  await page.keyboard.press('Enter')

  // Body text: bold by shortcut, italic by toolbar button, double spacing.
  await page.keyboard.press('Tab') // first-line indent
  await page.keyboard.type('This is ')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type('bold')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type(' and ')
  await page.getByRole('button', { name: 'Italic' }).click()
  await page.keyboard.type('italic')
  await page.getByRole('button', { name: 'Italic' }).click()
  await page.keyboard.type(' text.')
  await page.getByLabel('Line spacing').selectOption('2')
  await expect(page.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'false')

  // A bulleted list with a nested item.
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Bulleted list' }).click()
  await page.keyboard.type('First point')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Nested point')

  // What the student sees.
  const d = doc(page)
  await expect(d.locator('p[data-type="title"]')).toHaveText('My Paper')
  await expect(d.locator('p[data-type="title"]')).toHaveCSS('text-align', 'center')
  await expect(d.locator('h1')).toHaveText('Introduction')
  // Enter after the centered title starts left-aligned text.
  await expect(d.locator('h1')).toHaveCSS('text-align', 'start')
  await expect(d.locator('strong')).toHaveText('bold')
  await expect(d.locator('em')).toHaveText('italic')
  await expect(d.locator('p', { hasText: 'This is bold' })).toHaveCSS('line-height', /^\d/)
  await expect(d.locator('p', { hasText: 'This is bold' })).toHaveAttribute('style', /line-height: 2/)
  await expect(d.locator('ul ul li')).toHaveText('Nested point')
  // The paragraph's first-line indent does not leak into the list.
  await expect(d.locator('p', { hasText: 'This is bold' })).toHaveAttribute('style', /text-indent: 0.5in/)
  await expect(d.locator('li p').first()).not.toHaveAttribute('style', /text-indent/)

  // Undo takes something away, redo puts it back exactly.
  const before = await json(page)
  await page.keyboard.press('ControlOrMeta+z')
  expect(await json(page)).not.toEqual(before)
  await page.keyboard.press('ControlOrMeta+y')
  expect(await json(page)).toEqual(before)

  // JSON round trip: load the saved JSON into the editor and get identical JSON back.
  const roundTrip = await page.evaluate(() => {
    const ed = window.__openWriter!
    const saved = JSON.parse(JSON.stringify(ed.getJSON()))
    ed.commands.setContent(saved)
    return { saved, reloaded: ed.getJSON() }
  })
  expect(roundTrip.reloaded).toEqual(roundTrip.saved)
  expect(JSON.stringify(roundTrip.saved)).toContain('"type":"title"')
})

test('Format menu applies a hanging indent, highlight applies a color, Escape closes the menu', async ({ page }) => {
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
  await page.keyboard.type('Works cited entry that is long enough to wrap onto a second line of the page.')

  await page.getByRole('button', { name: 'Format', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Hanging indent' }).click()
  await expect(doc(page).locator('p').first()).toHaveAttribute('style', /text-indent: -0.5in/)

  await page.keyboard.press('ControlOrMeta+a')
  await page.getByRole('button', { name: 'Highlight', exact: true }).click()
  await page.getByRole('button', { name: 'Cyan' }).click()
  await expect(doc(page).locator('mark')).toHaveAttribute('data-color', '#00ffff')

  await page.getByRole('button', { name: 'Format', exact: true }).click()
  await expect(page.getByRole('menu', { name: 'Format' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: 'Format' })).toBeHidden()
})

test('Ctrl+A selects the document even when focus is on the toolbar', async ({ page }) => {
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
  await page.keyboard.type('Only the document gets selected.')
  await page.getByRole('button', { name: 'Bold' }).focus()
  await page.keyboard.press('ControlOrMeta+a')
  await expect(doc(page)).toBeFocused()
  const selected = await page.evaluate(() => {
    const ed = window.__openWriter!
    return { pm: ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to), dom: String(window.getSelection()) }
  })
  expect(selected.pm).toBe('Only the document gets selected.')
  expect(selected.dom).not.toContain('Untitled document')
})

test('a selection mixing a heading and normal text shows a blank style and can go back to Normal', async ({ page }) => {
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
  await page.keyboard.type('Normal paragraph text.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Heading text.')
  await page.getByLabel('Paragraph style').selectOption('h2')
  await expect(doc(page).locator('h2')).toHaveText('Heading text.')

  // Select from the middle of the paragraph into the heading.
  await page.evaluate(() => window.__openWriter!.commands.setTextSelection({ from: 5, to: 30 }))
  await expect(page.getByLabel('Paragraph style')).toHaveValue('')
  await page.getByLabel('Paragraph style').selectOption('paragraph')
  await expect(doc(page).locator('h2')).toHaveCount(0)
  await expect(doc(page).locator('p')).toHaveCount(2)
})

test('applying styles to the whole document does not pile up empty lines', async ({ page }) => {
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
  await page.keyboard.type('One.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Two.')
  for (const style of ['h1', 'title', 'h2', 'paragraph']) {
    await page.keyboard.press('ControlOrMeta+a')
    await page.getByLabel('Paragraph style').selectOption(style)
  }
  await expect(doc(page).locator(':scope > *')).toHaveCount(2)
})

test('typing right after a color, highlight, or menu pick lands in the document', async ({ page }) => {
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
  await page.keyboard.type('Start')
  await page.getByRole('button', { name: 'Text color' }).click()
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.keyboard.type(' red')
  await page.getByRole('button', { name: 'Highlight', exact: true }).click()
  await page.getByRole('button', { name: 'Yellow', exact: true }).click()
  await page.keyboard.type(' marked')
  await page.getByRole('button', { name: 'Format', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Space after paragraph' }).click()
  await page.keyboard.type(' spaced')
  await expect(doc(page)).toHaveText('Start red marked spaced')
  await expect(doc(page).locator('mark')).toHaveText(' marked spaced')
})
