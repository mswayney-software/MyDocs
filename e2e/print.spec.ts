import { expect, test, type Page } from '@playwright/test'

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })
const json = (page: Page) => page.evaluate(() => window.__openWriter!.getJSON())
const menu = async (page: Page, name: string, item: string) => {
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
    // The real print window can't be automated; count the calls instead.
    ;(window as unknown as { printCalls: number }).printCalls = 0
    window.print = () => void (window as unknown as { printCalls: number }).printCalls++
  })
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
})

/** The generated @page rule. */
const pageCss = (page: Page) => page.evaluate(() => document.getElementById('page-setup')?.textContent ?? '')
const printCalls = (page: Page) => page.evaluate(() => (window as unknown as { printCalls: number }).printCalls)

/** Page > Header, footer and page numbers: MLA style, last name and page number top right. */
async function setMlaHeader(page: Page, lastName: string) {
  await menu(page, 'Page', 'Header, footer and page numbers…')
  const dlg = page.getByRole('dialog', { name: 'Header, footer and page numbers' })
  await dlg.getByLabel('Page numbers').selectOption('header-right')
  await dlg.getByLabel('Text before the number').fill(lastName)
  await dlg.getByRole('button', { name: 'Apply' }).click()
  await expect(dlg).toBeHidden()
}

const LOREM =
  'The industrial revolution changed how people worked, where they lived, and what they expected from the future. ' +
  'Factories drew workers from farms into growing cities, and new machines made goods cheaper and more plentiful. '

/** An MLA paper: heading block, centered title, three pages of body text, then Works Cited. */
async function writeMlaPaper(page: Page) {
  await page.evaluate((lorem) => {
    const p = (text: string, attrs: Record<string, unknown> = {}) => ({ type: 'paragraph', attrs, content: [{ type: 'text', text }] })
    const body = Array.from({ length: 24 }, (_, i) => p(`${i + 1}. ${lorem.repeat(2)}`, { lineHeight: '2', firstLine: true }))
    window.__openWriter!.commands.setContent({
      type: 'doc',
      content: [
        p('Jane Smith'),
        p('Professor Ruiz'),
        p('English 101'),
        p('14 November 2026'),
        p('Machines and Cities', { textAlign: 'center' }),
        ...body,
        { type: 'pageBreak' },
        p('Works Cited', { textAlign: 'center' }),
      ],
    }, { emitUpdate: true })
  }, LOREM)
}

interface Item { str: string; x: number; y: number; w: number; h: number }

/** The text on each page of a PDF, with positions in points from the bottom left. */
async function pdfText(pdf: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const file = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, isEvalSupported: false }).promise
  const pages: { width: number; height: number; items: Item[] }[] = []
  for (let n = 1; n <= file.numPages; n++) {
    const p = await file.getPage(n)
    const [, , width, height] = p.view
    const content = await p.getTextContent()
    const items = content.items
      .filter((i): i is typeof i & { str: string; transform: number[]; width: number; height: number } => 'str' in i && i.str.trim() !== '')
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height }))
    pages.push({ width, height, items })
  }
  return pages
}

test('MLA paper prints with 1 inch margins and last name plus page number at the top right of every page', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium can print to PDF under test (and Firefox has no margin boxes)')

  await setMlaHeader(page, 'Smith')
  // The on-screen sheet previews the header as it prints on page 1.
  await expect(page.getByTestId('sheet-top')).toHaveText('Smith 1')
  await writeMlaPaper(page)

  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  // PRINT_PDF_OUT=path keeps the PDF for a look by eye.
  if (process.env.PRINT_PDF_OUT) (await import('node:fs')).writeFileSync(process.env.PRINT_PDF_OUT, pdf)
  const pages = await pdfText(pdf)
  expect(pages.length).toBeGreaterThanOrEqual(4) // three pages of text, then Works Cited on its own

  const INCH = 72
  pages.forEach((p, i) => {
    // US Letter.
    expect(p.width).toBeCloseTo(8.5 * INCH, 0)
    expect(p.height).toBeCloseTo(11 * INCH, 0)

    // Header: everything in the top margin, read left to right, is "Smith <page>".
    const header = p.items.filter((t) => t.y > p.height - INCH).sort((a, b) => a.x - b.x)
    expect(header.map((t) => t.str).join('').replace(/\s+/g, ' ').trim(), `page ${i + 1} header`).toBe(`Smith ${i + 1}`)
    // Flush with the right margin, half an inch from the top edge (MLA).
    const right = Math.max(...header.map((t) => t.x + t.w))
    expect(Math.abs(right - (p.width - INCH)), `page ${i + 1} header right edge`).toBeLessThan(2)
    const baseline = Math.min(...header.map((t) => t.y))
    expect(p.height - baseline, `page ${i + 1} header height`).toBeGreaterThan(0.35 * INCH)
    expect(p.height - baseline, `page ${i + 1} header height`).toBeLessThan(0.65 * INCH)

    // Body: inside the 1 inch margins on all four sides.
    const body = p.items.filter((t) => t.y <= p.height - INCH)
    expect(body.length, `page ${i + 1} has body text`).toBeGreaterThan(0)
    expect(Math.min(...body.map((t) => t.x)), `page ${i + 1} left margin`).toBeGreaterThanOrEqual(INCH - 1)
    expect(Math.max(...body.map((t) => t.x + t.w)), `page ${i + 1} right margin`).toBeLessThanOrEqual(p.width - INCH + 1)
    expect(Math.min(...body.map((t) => t.y)), `page ${i + 1} bottom margin`).toBeGreaterThanOrEqual(INCH - 1)
    // Nothing from the app's own toolbar or menus.
    expect(p.items.map((t) => t.str).join(' ')).not.toMatch(/Normal text|Open Writer|Insert|Works offline/)
  })
  // The page break put Works Cited at the top of the last page, alone.
  const last = pages.at(-1)!
  expect(last.items.filter((t) => t.y <= last.height - 72).map((t) => t.str).join('')).toBe('Works Cited')
  expect(pages[0].items.map((t) => t.str).join(' ')).toContain('Jane Smith')
})

test('page setup: A4 and custom margins resize the sheet, count as unsaved, and survive save and reopen', async ({ page }) => {
  const dirty = () => page.evaluate(() => window.__openWriterSession!.getState().dirty)
  await page.keyboard.type('Hello')
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByRole('dialog', { name: 'Save as' }).getByRole('button', { name: 'Download' }).click()
  await expect.poll(dirty).toBe(false)

  await menu(page, 'Page', 'Page setup…')
  const dlg = page.getByRole('dialog', { name: 'Page setup' })
  await dlg.getByLabel('Paper size').selectOption('a4')
  await dlg.getByLabel('Left margin').fill('1.5')
  await dlg.getByLabel('Top margin').fill('9') // too big: kept to 3 inches
  await dlg.getByRole('button', { name: 'Apply' }).click()
  await expect(doc(page)).toBeFocused()

  expect(await dirty()).toBe(true) // a page change is an unsaved change
  const sheet = page.locator('.sheet')
  const px = await sheet.evaluate((el) => el.getBoundingClientRect().width)
  expect(px).toBeCloseTo((210 / 25.4) * 96, 0) // 210 mm at 96 px per inch
  expect(await sheet.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('144px')
  const css = await pageCss(page)
  expect(css).toContain('size: A4;')
  expect(css).toContain('margin: 3in 1in 1in 1.5in;')

  // Typing still works where the cursor was.
  await page.keyboard.type(' world')
  const before = await json(page)
  const pageBefore = await page.evaluate(() => window.__openWriterSession!.getState().page)
  const download = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+s') // already named: downloads straight away
  const path = await (await download).path()
  await expect.poll(dirty).toBe(false)

  await menu(page, 'File', 'New')
  await expect.poll(() => pageCss(page)).toContain('size: letter;')
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('ControlOrMeta+o')
  await (await chooser).setFiles(path)
  await expect.poll(() => json(page)).toEqual(before)
  expect(await page.evaluate(() => window.__openWriterSession!.getState().page)).toEqual(pageBefore)
  await expect.poll(() => pageCss(page)).toContain('size: A4;')
  expect(await dirty()).toBe(false)
})

test('Ctrl+P and Save as PDF explain the print window, and warn where headers cannot print', async ({ page, browserName }) => {
  await page.keyboard.type('Essay')
  const marginBoxes = await page.evaluate(() => {
    const s = new CSSStyleSheet()
    s.replaceSync('@page { @top-right { content: "x"; } }')
    return ((s.cssRules[0] as CSSRule & { cssRules?: CSSRuleList }).cssRules?.length ?? 0) > 0
  })
  expect(marginBoxes).toBe(browserName === 'chromium')

  // Without a header: a short tip, which can be turned off.
  await page.keyboard.press('ControlOrMeta+p')
  const tip = page.getByRole('dialog', { name: 'Print' })
  await expect(tip).toContainText('Pick your printer')
  await tip.getByLabel('Don’t show this again').check()
  await tip.getByRole('button', { name: 'Continue' }).click()
  await expect.poll(() => printCalls(page)).toBe(1)
  await expect(doc(page)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+p')
  await expect.poll(() => printCalls(page)).toBe(2) // straight to the print window now

  // Save as PDF always says which destination to pick.
  await menu(page, 'File', 'Save as PDF…')
  const pdf = page.getByRole('dialog', { name: 'Save as PDF' })
  await expect(pdf).toContainText('Save as PDF')
  await pdf.getByRole('button', { name: 'Continue' }).click()
  await expect.poll(() => printCalls(page)).toBe(3)

  // With page numbers: Chrome and Edge print them; other browsers say plainly that they can't.
  await setMlaHeader(page, 'Smith')
  await menu(page, 'File', 'Save as PDF…')
  if (browserName === 'chromium') {
    await expect(pdf).toContainText('Headers and footers')
    await pdf.getByRole('button', { name: 'Continue' }).click()
  } else {
    const warn = page.getByRole('dialog', { name: /won’t print here/ })
    await expect(warn).toContainText('Chrome or Edge')
    await warn.getByRole('button', { name: 'Cancel' }).click()
    await expect.poll(() => printCalls(page)).toBe(3)
    await menu(page, 'File', 'Save as PDF…')
    await warn.getByRole('button', { name: 'Continue without them' }).click()
  }
  await expect.poll(() => printCalls(page)).toBe(4)
})

test('clicking the header preview opens its settings, and clearing it removes the preview', async ({ page }) => {
  await setMlaHeader(page, 'Smith')
  await page.getByTestId('sheet-top').click()
  const dlg = page.getByRole('dialog', { name: 'Header, footer and page numbers' })
  await expect(dlg.getByLabel('Text before the number')).toHaveValue('Smith')
  await dlg.getByLabel('Footer text').fill('Draft for peer review')
  await dlg.getByLabel('Page numbers').selectOption('none')
  await dlg.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByTestId('sheet-top')).toHaveCount(0)
  await expect(page.getByTestId('sheet-bottom')).toHaveText('Draft for peer review')
  await expect(doc(page)).toBeFocused()
  await page.keyboard.type('still typing')
  await expect(doc(page)).toHaveText('still typing')
})
