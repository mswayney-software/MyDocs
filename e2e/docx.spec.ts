import { expect, test, type Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { JSONContent } from '@tiptap/core'

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })
const json = (page: Page) => page.evaluate(() => window.__openWriter!.getJSON())
const pageSettings = (page: Page) => page.evaluate(() => window.__openWriterSession!.getState().page)

test.beforeEach(async ({ page }) => {
  // Intercept file pickers from the start: enabling it on the first wait races the key press.
  page.on('filechooser', () => {})
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
})

/** Export > Save as Word file, and return where the download landed. */
async function exportWord(page: Page, keepAs?: string): Promise<string> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Save as Word file (.docx)…' }).click()
  const d = await download
  expect(d.suggestedFilename()).toMatch(/\.docx$/)
  const path = await d.path()
  // EXPORT_OUT=dir keeps each export, to open in LibreOffice or Word.
  if (process.env.EXPORT_OUT && keepAs) {
    mkdirSync(process.env.EXPORT_OUT, { recursive: true })
    copyFileSync(path, `${process.env.EXPORT_OUT}/${keepAs}`)
  }
  await expect(doc(page)).toBeFocused()
  return path
}

/** File > Open a Word file; it opens as an unsaved copy named after it. */
async function openWord(page: Page, path: string, name: string) {
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('ControlOrMeta+o')
  const confirm = page.getByRole('dialog', { name: /Save changes/ })
  await Promise.race([chooser, confirm.waitFor().then(() => confirm.getByRole('button', { name: 'Don’t save' }).click())])
  await (await chooser).setFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: readFileSync(path) })
  await expect(page.locator('.file-name')).toHaveText(name.replace(/\.docx$/, ''), { timeout: 30000 })
  await expect(page.locator('.file-state')).toContainText('Some formatting may not have carried over')
  await expect(doc(page)).toBeFocused()
}

/** A PNG of the given size, drawn in the page. */
async function pngDataUrl(page: Page, w: number, h: number) {
  return page.evaluate(([w, h]) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.fillStyle = '#2f6db5'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#ffd400'
    g.fillRect(w / 4, h / 4, w / 2, h / 2)
    return c.toDataURL('image/png')
  }, [w, h])
}

const t = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, ...(marks && { marks }) })
const p = (content: JSONContent[] | string, attrs: Record<string, unknown> = {}): JSONContent => ({
  type: 'paragraph',
  attrs,
  content: typeof content === 'string' ? [t(content)] : content,
})
const li = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content })
const cell = (type: 'tableCell' | 'tableHeader', text: string, attrs: Record<string, unknown> = {}): JSONContent => ({
  type,
  attrs,
  content: [p(text)],
})

/** A school paper using every feature the Word export handles. */
function richPaper(png: string): JSONContent {
  return {
    type: 'doc',
    content: [
      { type: 'title', content: [t('Machines and Cities')] },
      p('Jane Smith'),
      { type: 'heading', attrs: { level: 1 }, content: [t('Introduction')] },
      p('Double spaced, indented first line, justified.', { lineHeight: 2, firstLine: 0.5, textAlign: 'justify' }),
      p('A centered line with space after.', { textAlign: 'center', spaceAfter: 12 }),
      p('Hanging indent for a citation entry that runs long enough to wrap onto a second line.', { indent: 0.5, firstLine: -0.5 }),
      { type: 'heading', attrs: { level: 2 }, content: [t('Formatting')] },
      p([
        t('bold', [{ type: 'bold' }]),
        t(' '),
        t('italic', [{ type: 'italic' }]),
        t(' '),
        t('underline', [{ type: 'underline' }]),
        t(' '),
        t('strike', [{ type: 'strike' }]),
        t(' H'),
        t('2', [{ type: 'subscript' }]),
        t('O x'),
        t('2', [{ type: 'superscript' }]),
        t(' '),
        t('red', [{ type: 'textStyle', attrs: { color: '#c00000', fontFamily: null, fontSize: null } }]),
        t(' '),
        t('marked', [{ type: 'highlight', attrs: { color: '#ffff00' } }]),
        t(' '),
        t('Arial 14', [{ type: 'textStyle', attrs: { color: null, fontFamily: 'Arimo', fontSize: '14pt' } }]),
        t(' '),
        t('a link', [{ type: 'link', attrs: { href: 'https://example.com/source' } }]),
      ]),
      p([t('Name:\tPeriod:'), { type: 'hardBreak' }, t('second line')]),
      { type: 'heading', attrs: { level: 3 }, content: [t('Lists')] },
      {
        type: 'bulletList',
        content: [li(p('Apples'), { type: 'bulletList', content: [li(p('Green')), li(p('Red'))] }), li(p('Pears'))],
      },
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: [li(p('First'), { type: 'orderedList', attrs: { start: 1 }, content: [li(p('Sub one'))] }), li(p('Second'))],
      },
      { type: 'orderedList', attrs: { start: 1 }, content: [li(p('Restarts at one'))] },
      { type: 'blockquote', content: [p('A long quotation set off from the text.')] },
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'Day'), cell('tableHeader', 'Red'), cell('tableHeader', 'Blue')] },
          { type: 'tableRow', content: [cell('tableCell', '2'), cell('tableCell', '14'), cell('tableCell', '16')] },
          { type: 'tableRow', content: [cell('tableCell', 'Total', { colspan: 2 }), cell('tableCell', '30')] },
        ],
      },
      { type: 'image', attrs: { src: png, alt: 'Chart', width: 240, height: 150, align: 'right' } },
      { type: 'pageBreak' },
      { type: 'heading', attrs: { level: 1 }, content: [t('Works Cited')] },
      p('Hughes, Anna. Factories and Families. River Press, 2019.', { indent: 0.5, firstLine: -0.5, lineHeight: 2 }),
    ],
  }
}

/** What must come back from Word: each block's kind, text, and the formatting the editor shows. */
function shape(node: JSONContent): unknown {
  const a = node.attrs ?? {}
  switch (node.type) {
    case 'doc':
    case 'bulletList':
    case 'orderedList':
    case 'listItem':
    case 'blockquote':
    case 'table':
    case 'tableRow':
      return { [node.type]: (node.content ?? []).map(shape) }
    case 'tableCell':
    case 'tableHeader':
      return { [node.type]: (node.content ?? []).map(shape), colspan: a.colspan ?? 1 }
    case 'image':
      return { image: { width: a.width, height: a.height, align: a.align, alt: a.alt } }
    case 'pageBreak':
      return 'pageBreak'
    default: {
      const runs = (node.content ?? []).map((c) =>
        c.type === 'hardBreak' ? '<br>' : [c.text, ...(c.marks ?? []).map((m) => m.type + (m.attrs?.href ? `:${m.attrs.href}` : '') + (m.attrs?.color ? `:${m.attrs.color}` : '') + (m.attrs?.fontFamily ? `:${m.attrs.fontFamily}` : '') + (m.attrs?.fontSize ? `:${m.attrs.fontSize}` : '')).sort()].join('|'),
      )
      const layout = Object.fromEntries(
        ['level', 'textAlign', 'lineHeight', 'firstLine', 'indent', 'spaceAfter'].filter((k) => a[k] != null && !(k === 'textAlign' && a[k] === 'left')).map((k) => [k, a[k]]),
      )
      return { [node.type!]: runs, ...layout }
    }
  }
}

test('Word export: a paper with every kind of content comes back the same when opened again', async ({ page }) => {
  const png = await pngDataUrl(page, 480, 300)
  await page.evaluate((content) => window.__openWriter!.commands.setContent(content, { emitUpdate: true }), richPaper(png))
  // MLA page setup on A4, with a footer too.
  await page.evaluate(() => {
    const s = window.__openWriterSession!
    s.setPage({
      ...s.getState().page,
      paperSize: 'a4',
      margins: { top: 1, right: 1.25, bottom: 1, left: 1.25 },
      pageNumbers: 'header-right',
      pageNumberPrefix: 'Smith',
      footer: 'Draft',
      footerAlign: 'center',
    })
  })
  const before = await json(page)
  const pageBefore = await pageSettings(page)

  const path = await exportWord(page, 'rich-paper.docx')
  // Exporting doesn't change the document or its saved state.
  expect(await json(page)).toEqual(before)

  await openWord(page, path, 'Untitled document.docx')
  const after = await json(page)
  expect(shape(after)).toEqual(shape(before))
  expect(await pageSettings(page)).toEqual(pageBefore)
  // The copy is unsaved, so closing the tab would warn.
  expect(await page.evaluate(() => window.__openWriterSession!.getState().dirty)).toBe(true)
})

test('Word import: a file that is not a Word document shows a clear message', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('ControlOrMeta+o')
  await (await chooser).setFiles({ name: 'essay.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a zip file') })
  const dlg = page.getByRole('dialog', { name: 'Could not open "essay.docx"' })
  await expect(dlg).toContainText("isn't a Word document")
  await dlg.getByRole('button', { name: 'OK' }).click()
  await expect(doc(page)).toBeFocused()
  await expect(page.locator('.file-name')).toHaveText('Untitled document')
})

// ---- real papers -----------------------------------------------------------------------------

interface Paper {
  file: string
  source: string
  expect: { words: number; headings: number; listItems: number; tables: number; cells: number; images: number; header?: string; pageNumberPrefix?: string; note?: string }
}
const papers: Paper[] = JSON.parse(readFileSync('e2e/fixtures/sample-papers.json', 'utf8'))
const dir = 'e2e/fixtures/docx-online'

async function counts(page: Page) {
  return page.evaluate(() => {
    const d = window.__openWriter!.state.doc
    const c = { words: 0, headings: 0, listItems: 0, tables: 0, cells: 0, images: 0 }
    d.descendants((n) => {
      const k = n.type.name
      if (k === 'heading' || k === 'title') c.headings++
      else if (k === 'listItem') c.listItems++
      else if (k === 'table') c.tables++
      else if (k === 'tableCell' || k === 'tableHeader') c.cells++
      else if (k === 'image') c.images++
    })
    c.words = d.textBetween(0, d.content.size, ' ', ' ').split(/\s+/).filter(Boolean).length
    return c
  })
}

for (const paper of papers) {
  test(`real paper: ${paper.file} (${paper.source}) imports with text, headings, lists, tables and images, and survives a Word round trip`, async ({ page }) => {
    test.setTimeout(120_000) // two imports and an export of a real paper, under parallel load
    const path = `${dir}/${paper.file}`
    test.skip(!existsSync(path), 'Sample paper not downloaded: run node scripts/fetch-sample-papers.mjs')
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const started = Date.now()
    await openWord(page, path, paper.file)
    test.info().annotations.push({ type: 'import time', description: `${Date.now() - started} ms` })

    const { header, pageNumberPrefix, note: _note, ...want } = paper.expect
    expect(await counts(page)).toEqual(want)
    const settings = await pageSettings(page)
    if (header !== undefined) expect(settings.header).toBe(header)
    if (pageNumberPrefix !== undefined) {
      expect(settings.pageNumbers).toBe('header-right')
      expect(settings.pageNumberPrefix).toBe(pageNumberPrefix)
    }

    // Our own export of a real paper, opened again, loses nothing either.
    const before = await json(page)
    const exported = await exportWord(page, paper.file)
    await openWord(page, exported, `again-${paper.file}`)
    expect(await counts(page)).toEqual(want)
    expect(shape(await json(page))).toEqual(shape(before))
    expect(await pageSettings(page)).toEqual(settings)
    expect(errors).toEqual([])
  })
}
