import { expect, test, type Page } from '@playwright/test'

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })
const json = (page: Page) => page.evaluate(() => window.__openWriter!.getJSON())
const menu = async (page: Page, name: string, item: string) => {
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('menuitem', { name: item }).or(page.getByRole('menuitemcheckbox', { name: item })).click()
}

test.beforeEach(async ({ page }) => {
  // Intercept file pickers from the start: enabling it on the first wait races the key press.
  page.on('filechooser', () => {})
  // Real save and open dialogs can't be automated: use the download and file-input path.
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
})

/** Save to a real file, start over, open that file, and check the document came back exactly. */
async function saveAndReopen(page: Page) {
  const before = await json(page)
  const download = page.waitForEvent('download')
  await page.keyboard.press('ControlOrMeta+s')
  const saveAs = page.getByRole('dialog', { name: 'Save as' })
  if (await saveAs.isVisible().catch(() => false)) await saveAs.getByRole('button', { name: 'Download' }).click()
  else await page.getByRole('dialog', { name: 'Save as' }).getByRole('button', { name: 'Download' }).click()
  const path = await (await download).path()

  await menu(page, 'File', 'New')
  await expect(doc(page)).toHaveText('')
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('ControlOrMeta+o')
  await (await chooser).setFiles(path)
  await expect.poll(() => json(page)).toEqual(before)
}

/** A PNG of the given size, drawn in the page. */
async function makePng(page: Page, width: number, height: number): Promise<Buffer> {
  const b64 = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')!
      g.fillStyle = '#5b2bb5'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#ffd400'
      g.fillRect(w / 4, h / 4, w / 2, h / 2)
      return c.toDataURL('image/png').split(',')[1]
    },
    [width, height],
  )
  return Buffer.from(b64, 'base64')
}

test('tables: insert, type with Tab, add and remove rows and columns, merge, header row, save and reopen', async ({ page }) => {
  await menu(page, 'Insert', 'Table…')
  const dlg = page.getByRole('dialog', { name: 'Insert table' })
  await dlg.getByLabel('Rows').fill('2')
  await dlg.getByLabel('Columns').fill('3')
  await dlg.getByRole('button', { name: 'Insert' }).click()

  const table = doc(page).locator('table')
  await expect(table.locator('th')).toHaveCount(3)
  await expect(table.locator('tr')).toHaveCount(2)
  // Tab moves between cells (not a first-line indent).
  for (const t of ['Name', 'Date', 'Score', 'Ana', 'Mon', '90']) {
    await page.keyboard.type(t)
    await page.keyboard.press('Tab')
  }
  // Tab in the last cell adds a row.
  await expect(table.locator('tr')).toHaveCount(3)
  await page.keyboard.type('Ben')

  // Add a row and a column, then delete those same ones (delete acts where the cursor is).
  await menu(page, 'Table', 'Add row below')
  await expect(table.locator('tr')).toHaveCount(4)
  await table.locator('tr').nth(3).locator('td').first().click()
  await menu(page, 'Table', 'Delete row')
  await expect(table.locator('tr')).toHaveCount(3)
  await table.getByText('Score').click()
  await menu(page, 'Table', 'Add column right')
  await expect(table.locator('tr').first().locator('th')).toHaveCount(4)
  await table.locator('tr').first().locator('th').nth(3).click()
  await menu(page, 'Table', 'Delete column')
  await expect(table.locator('tr').first().locator('th')).toHaveCount(3)
  await expect(table).toContainText('NameDateScoreAnaMon90Ben')

  // Merge two cells by dragging across them.
  const a = table.getByText('Mon')
  const b = table.getByText('90')
  const ab = (await a.boundingBox())!
  const bb = (await b.boundingBox())!
  await page.mouse.move(ab.x + 2, ab.y + ab.height / 2)
  await page.mouse.down()
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 5 })
  await page.mouse.up()
  await menu(page, 'Table', 'Merge cells')
  await expect(table.locator('td[colspan="2"]')).toHaveCount(1)

  // Header row off and back on.
  await table.getByText('Ana').click()
  await menu(page, 'Table', 'Header row')
  await expect(table.locator('th')).toHaveCount(0)
  await menu(page, 'Table', 'Header row')
  await expect(table.locator('th')).toHaveCount(3)

  await saveAndReopen(page)
  await expect(doc(page).locator('td[colspan="2"]')).toContainText('Mon')
})

test('Backspace below a table and Delete above it move into the table and never lose text', async ({ page }) => {
  await page.keyboard.type('Intro text.')
  await menu(page, 'Insert', 'Table…')
  await page.getByRole('dialog', { name: 'Insert table' }).getByRole('button', { name: 'Insert' }).click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type('Conclusion goes here.')
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('last cell')
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.press('End')
  // Wait for the cursor to arrive, as a person's timing would. (Known: at machine speed under
  // heavy CPU load, Chromium occasionally drops this cursor jump. Text is never lost.)
  await expect
    .poll(() => page.evaluate(() => window.__openWriter!.state.selection.$from.parent.textContent))
    .toBe('Intro text.')
  await page.keyboard.press('Delete')
  await page.keyboard.type('first cell')

  const state = await page.evaluate(() => {
    const ed = window.__openWriter!
    return {
      blocks: ed.state.doc.content.content.map((n) => n.type.name),
      text: ed.state.doc.textContent,
      // What is on screen must match the document exactly.
      inSync:
        JSON.stringify(ed.state.doc.content.content.map((n) => n.textContent)) ===
        JSON.stringify([...ed.view.dom.children].map((c) => c.textContent)),
    }
  })
  expect(state.blocks).toEqual(['paragraph', 'table', 'paragraph'])
  expect(state.text).toBe('Intro text.first celllast cellConclusion goes here.')
  expect(state.inSync).toBe(true)
  await saveAndReopen(page)
})

test('images: insert from a file (large photos scaled down), paste, align, resize, save and reopen', async ({ page, browserName }) => {
  await page.keyboard.type('Figure 1.')
  // A 3000 x 2000 image is scaled to at most 1600 px and fitted to the page width.
  const big = await makePng(page, 3000, 2000)
  const chooser = page.waitForEvent('filechooser')
  await menu(page, 'Insert', 'Image…')
  await (await chooser).setFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: big })
  const img = doc(page).locator('img').first()
  await expect(img).toBeVisible()
  const attrs = await page.evaluate(() => window.__openWriter!.getJSON().content!.find((n) => n.type === 'image')!.attrs!)
  expect(attrs.src).toMatch(/^data:image\/png;base64,/)
  expect(attrs.width).toBeLessThanOrEqual(624)
  const natural = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
  expect(natural).toBe(1600)

  // Select it, align right from the Image menu.
  await img.click()
  await menu(page, 'Image', 'Align right')
  await expect(img).toHaveAttribute('data-align', 'right')

  // Resize by dragging the bottom-right corner handle inward.
  const box = (await img.boundingBox())!
  const handle = doc(page).locator('[data-resize-handle="bottom-right"]').first()
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x - 200, hb.y - 100, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await img.boundingBox())!.width).toBeLessThan(box.width - 100)

  // Paste an image from the clipboard, at the end of the caption paragraph. (Firefox ignores
  // clipboard data on synthetic paste events; the paste code is the same in both browsers.)
  if (browserName === 'chromium') {
  await doc(page).getByText('Figure 1.').click()
  await page.keyboard.press('End')
  const small = (await makePng(page, 40, 30)).toString('base64')
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
    window.__openWriter!.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, small)
  await expect(doc(page).locator('img')).toHaveCount(2)
  }

  await saveAndReopen(page)
  await expect(doc(page).locator('img[data-align="right"]')).toHaveCount(1)
})

test('images from web pages are refused with an explanation, and the app cannot reach the network', async ({ page, browserName }) => {
  // Synthetic paste: Chromium only, see the images test.
  if (browserName === 'chromium') {
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('text/html', '<p>Caption</p><img src="https://tracker.example/pixel.gif">')
    dt.setData('text/plain', 'Caption')
    window.__openWriter!.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(doc(page)).toContainText('Caption')
  await expect(doc(page).locator('img')).toHaveCount(0)
  await expect(page.getByRole('status').first()).toContainText('Images from web pages were not pasted')
  }

  // The Content-Security-Policy blocks any outside request, even one added by hand.
  const violation = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener('securitypolicyviolation', (e) => resolve(e.violatedDirective), { once: true })
        const img = document.createElement('img')
        img.src = 'https://tracker.example/pixel.gif'
        document.body.append(img)
        setTimeout(() => resolve('none'), 3000)
      }),
  )
  expect(violation).toMatch(/^img-src/)
})

test('links: add with Ctrl+K, Ctrl+click opens, unsafe addresses refused, edit and remove, save and reopen', async ({ page, context }) => {
  await context.route('https://example.com/**', (r) => r.fulfill({ body: 'example' }))
  await page.keyboard.type('Read the source here.')
  await page.keyboard.press('Shift+ArrowLeft')
  for (let i = 0; i < 'source here'.length - 1; i++) await page.keyboard.press('Shift+ArrowLeft')
  // Selection is now "source here" (minus the final period), approximately; select by text instead:
  await page.evaluate(() => {
    const ed = window.__openWriter!
    const text = ed.state.doc.textContent
    const from = text.indexOf('source') + 1
    ed.commands.setTextSelection({ from, to: from + 'source'.length })
  })
  await page.keyboard.press('ControlOrMeta+k')
  const dlg = page.getByRole('dialog', { name: 'Add link' })
  await dlg.getByLabel('Web or email address').fill('javascript:alert(1)')
  await dlg.getByRole('button', { name: 'Add link' }).click()
  await page.getByRole('dialog', { name: 'That address can’t be a link' }).getByRole('button', { name: 'OK' }).click()
  await expect(doc(page).locator('a')).toHaveCount(0)

  await page.evaluate(() => {
    const ed = window.__openWriter!
    const from = ed.state.doc.textContent.indexOf('source') + 1
    ed.commands.setTextSelection({ from, to: from + 'source'.length })
  })
  await page.keyboard.press('ControlOrMeta+k')
  await dlg.getByLabel('Web or email address').fill('example.com/paper')
  await dlg.getByRole('button', { name: 'Add link' }).click()
  const link = doc(page).locator('a')
  await expect(link).toHaveText('source')
  await expect(link).toHaveAttribute('href', 'https://example.com/paper')

  // A plain click places the cursor; Ctrl+click opens the link in a new tab.
  await link.click()
  await expect(page.context().pages()).toHaveLength(1)
  const popup = page.waitForEvent('popup')
  await link.click({ modifiers: ['ControlOrMeta'] })
  expect((await popup).url()).toBe('https://example.com/paper')

  await saveAndReopen(page)
  await expect(doc(page).locator('a')).toHaveAttribute('href', 'https://example.com/paper')

  // Edit, then remove.
  await doc(page).locator('a').click()
  await expect.poll(() => page.evaluate(() => window.__openWriter!.isActive('link'))).toBe(true)
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('dialog', { name: 'Edit link' }).getByRole('button', { name: 'Remove link' }).click()
  await expect(doc(page).locator('a')).toHaveCount(0)
  await expect(doc(page)).toHaveText('Read the source here.')
})

test('page break: Ctrl+Enter inserts one, and it survives save and reopen', async ({ page }) => {
  await page.keyboard.type('Last line of the essay.')
  await page.keyboard.press('ControlOrMeta+Enter')
  await page.keyboard.type('Works Cited')
  await expect(doc(page).locator('.page-break')).toHaveCount(1)
  await menu(page, 'Insert', 'Page break')
  await expect(doc(page).locator('.page-break')).toHaveCount(2)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(doc(page).locator('.page-break')).toHaveCount(1)
  await saveAndReopen(page)
  await expect(doc(page).locator('.page-break')).toHaveCount(1)
})

test('find and replace: Ctrl+F finds across formatting, Ctrl+H replaces, Escape closes, undo restores', async ({ page }) => {
  await page.keyboard.type('The cat sat. A ')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type('CAT')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.type(' and a c')
  await page.keyboard.press('ControlOrMeta+i')
  await page.keyboard.type('at')
  await page.keyboard.press('ControlOrMeta+i')
  await page.keyboard.type('.')

  await page.keyboard.press('ControlOrMeta+f')
  const find = page.getByRole('search')
  await find.getByLabel('Find', { exact: true }).fill('cat')
  await expect(find.getByRole('status')).toHaveText('1 of 3')
  await expect(doc(page).locator('.search-match')).toHaveCount(4) // the split match is two pieces
  await find.getByLabel('Find', { exact: true }).press('Enter')
  await expect(find.getByRole('status')).toHaveText('2 of 3')
  await find.getByLabel('Match case').check()
  await expect(find.getByRole('status')).toHaveText(/of 2$/)
  await find.getByLabel('Match case').uncheck()

  await page.keyboard.press('ControlOrMeta+h')
  await find.getByLabel('Replace with').fill('dog')
  await find.getByRole('button', { name: 'Replace all' }).click()
  await expect(find.getByRole('status')).toHaveText('Replaced 3')
  await expect(doc(page)).toHaveText('The dog sat. A dog and a dog.')
  await expect(doc(page).locator('strong')).toHaveText('dog') // formatting kept

  await page.keyboard.press('Escape')
  await expect(find).toHaveCount(0)
  await expect(doc(page).locator('.search-match')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(doc(page)).toHaveText('The cat sat. A CAT and a cat.')
  await saveAndReopen(page)
})

test('word count: words and characters in the status bar, and for a selection', async ({ page }) => {
  const count = page.locator('.word-count')
  await expect(count).toHaveText('0 words · 0 characters')
  await page.keyboard.type('One two three.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Four')
  await expect(count).toHaveText('4 words · 18 characters')
  await page.keyboard.press('Shift+Home')
  await expect(count).toHaveText('1 of 4 words · 4 of 18 characters')
  await saveAndReopen(page)
  await expect(count).toHaveText('4 words · 18 characters')
})
