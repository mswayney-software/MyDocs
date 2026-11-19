import { expect, test, type Page } from '@playwright/test'
import { pdfText } from './pdf-text'

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })
const session = (page: Page) =>
  page.evaluate(() => {
    const s = window.__openWriterSession!.getState()
    return { page: s.page, dirty: s.dirty, fileName: s.fileName }
  })
const blocks = (page: Page) =>
  page.evaluate(() => {
    const out: { type: string; text: string; attrs: Record<string, unknown> }[] = []
    window.__openWriter!.state.doc.forEach((n) => out.push({ type: n.type.name, text: n.textContent, attrs: n.attrs }))
    return out
  })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
})

async function fromTemplate(page: Page, template: string, values: Record<string, string>) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New from template…' }).click()
  const pick = page.getByRole('dialog', { name: 'New from template' })
  await pick.getByLabel('Template').selectOption({ label: template })
  await pick.getByRole('button', { name: 'Next' }).click()
  const details = page.getByRole('dialog', { name: template })
  for (const [label, value] of Object.entries(values)) await details.getByLabel(label, { exact: true }).fill(value)
  await details.getByRole('button', { name: 'Create' }).click()
  await expect(details).toBeHidden()
  await expect(doc(page)).toBeFocused()
}

test('MLA template: heading block, title, last name and page number header, Works Cited, ready to type', async ({ page }) => {
  await fromTemplate(page, 'MLA paper', {
    'Your first and last name': 'Jane Smith',
    Instructor: 'Professor Ruiz',
    Course: 'English 101',
    'Paper title': 'Machines and Cities',
  })
  const s = await session(page)
  expect(s.fileName).toBe('Machines and Cities')
  expect(s.dirty).toBe(false) // nothing to save until the student writes
  expect(s.page).toMatchObject({
    paperSize: 'letter',
    margins: { top: 1, right: 1, bottom: 1, left: 1 },
    pageNumbers: 'header-right',
    pageNumberPrefix: 'Smith',
  })
  await expect(page.getByTestId('sheet-top')).toHaveText('Smith 1')

  const b = await blocks(page)
  expect(b.slice(0, 5).map((x) => x.text)).toEqual([
    'Jane Smith',
    'Professor Ruiz',
    'English 101',
    expect.stringMatching(/^\d{1,2} [A-Z][a-z]+ \d{4}$/),
    'Machines and Cities',
  ])
  expect(b[4].attrs.textAlign).toBe('center')
  // Double spaced throughout.
  expect(b.filter((x) => x.type === 'paragraph').every((x) => x.attrs.lineHeight === 2)).toBe(true)
  expect(b[5].attrs.firstLine).toBe(0.5)
  expect(b.map((x) => x.type)).toContain('pageBreak')
  expect(b.at(-2)!.text).toBe('Works Cited')
  expect(b.at(-1)!.attrs).toMatchObject({ indent: 0.5, firstLine: -0.5 }) // hanging indent

  // The cursor is on the placeholder: typing replaces it.
  await page.keyboard.type('The industrial revolution changed everything.')
  expect((await blocks(page))[5].text).toBe('The industrial revolution changed everything.')
  expect((await session(page)).dirty).toBe(true)
})

test('MLA template prints with 1 inch margins and last name plus page number at the top right of every page', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium can print to PDF under test (and Firefox has no margin boxes)')
  await fromTemplate(page, 'MLA paper', { 'Your first and last name': 'Jane Smith', 'Paper title': 'Machines and Cities' })
  // Two and a half pages of writing.
  const sentence = 'Factories drew workers from farms into growing cities, and new machines made goods cheaper. '
  for (let i = 0; i < 12; i++) {
    await page.keyboard.insertText(sentence.repeat(6))
    await page.keyboard.press('Enter')
  }
  const pages = await pdfText(await page.pdf({ preferCSSPageSize: true }))
  expect(pages.length).toBeGreaterThanOrEqual(3)
  const INCH = 72
  pages.forEach((p, i) => {
    const header = p.items.filter((t) => t.y > p.height - INCH).sort((a, b) => a.x - b.x)
    expect(header.map((t) => t.str).join('').replace(/\s+/g, ' ').trim(), `page ${i + 1}`).toBe(`Smith ${i + 1}`)
    const right = Math.max(...header.map((t) => t.x + t.w))
    expect(Math.abs(right - (p.width - INCH)), `page ${i + 1} header at the right margin`).toBeLessThan(2)
    const body = p.items.filter((t) => t.y <= p.height - INCH)
    expect(Math.min(...body.map((t) => t.x)), `page ${i + 1} left margin`).toBeGreaterThanOrEqual(INCH - 1)
    expect(Math.max(...body.map((t) => t.x + t.w)), `page ${i + 1} right margin`).toBeLessThanOrEqual(p.width - INCH + 1)
    expect(Math.min(...body.map((t) => t.y)), `page ${i + 1} bottom margin`).toBeGreaterThanOrEqual(INCH - 1)
  })
  // Works Cited starts its own page.
  expect(pages.at(-1)!.items.map((t) => t.str).join(' ')).toContain('Works Cited')
})

test('APA template: title page, page numbers top right, title again, References', async ({ page }) => {
  await fromTemplate(page, 'APA student paper', {
    'Paper title': 'Sleep and Memory',
    'Your name': 'Alex Chen',
    'Department and school': 'Department of Psychology, State College',
    'Course number and name': 'PSY 210: Research Methods',
    Instructor: 'Dr. Patel',
  })
  const s = await session(page)
  expect(s.page).toMatchObject({ pageNumbers: 'header-right', pageNumberPrefix: '', margins: { top: 1, right: 1, bottom: 1, left: 1 } })
  await expect(page.getByTestId('sheet-top')).toHaveText('1')
  const b = await blocks(page)
  const texts = b.map((x) => x.text)
  expect(texts).toContain('Alex Chen')
  expect(texts).toContain('Department of Psychology, State College')
  expect(texts.filter((t) => t === 'Sleep and Memory')).toHaveLength(2) // title page and first page of text
  expect(b.filter((x) => x.type === 'pageBreak')).toHaveLength(2)
  expect(texts.at(-2)).toBe('References')
  const titleBold = await page.evaluate(() => {
    let bold = false
    window.__openWriter!.state.doc.descendants((n) => {
      if (n.isText && n.text === 'Sleep and Memory') bold = n.marks.some((m) => m.type.name === 'bold')
    })
    return bold
  })
  expect(titleBold).toBe(true)
  // Typing replaces the placeholder on the first page of text.
  await page.keyboard.type('Students who slept')
  const after = (await blocks(page)).map((x) => x.text)
  expect(after).toContain('Students who slept')
  expect(after).not.toContain('Start writing here.')
})

test('a template asks before replacing unsaved work, and Cancel keeps it', async ({ page }) => {
  await page.keyboard.type('My unsaved draft')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New from template…' }).click()
  await page.getByRole('dialog', { name: 'New from template' }).getByRole('button', { name: 'Next' }).click()
  await page.getByRole('dialog', { name: 'MLA paper' }).getByRole('button', { name: 'Create' }).click()
  const confirm = page.getByRole('dialog', { name: /Save changes/ })
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(doc(page)).toHaveText('My unsaved draft')
})
