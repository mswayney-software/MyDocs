import { expect, firefox, test, webkit, type Browser, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildStressDeck, STRESS } from '../scripts/stress-deck'
import { deck, open } from './helpers'
import { readPdf } from './pdf'

let stressFile = ''
// eslint-disable-next-line no-empty-pattern -- Playwright needs the fixtures argument before testInfo
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000) // building the deck takes a few seconds, longer on a busy machine
  stressFile = join(mkdtempSync(join(tmpdir(), 'myslides-print-')), 'Stress deck.myslides')
  writeFileSync(stressFile, await buildStressDeck())
})

async function openStress(page: Page) {
  await open(page)
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+o')
  await (await chooser).setFiles(stressFile)
  await expect(page.locator('.file-name')).toHaveText('Stress deck', { timeout: 20_000 })
}

/**
 * Save as PDF the way a student does (Ctrl+P, the note, Continue), then let Chrome's print engine
 * write the PDF that its print window would. The print window itself is the browser's, so the
 * test stands in for it at the last step.
 */
async function savePdf(page: Page, paper?: { format: 'Letter'; landscape: boolean; margin: Record<'top' | 'right' | 'bottom' | 'left', string> }) {
  await page.evaluate(() => {
    window.print = () => void ((window as unknown as { __printed: boolean }).__printed = true)
  })
  await page.keyboard.press('ControlOrMeta+p')
  const note = page.getByRole('dialog', { name: 'Save as PDF' })
  await expect(note).toBeVisible()
  const text = await note.textContent()
  await note.getByRole('button', { name: 'Continue' }).click()
  await page.waitForFunction(() => (window as unknown as { __printed?: boolean }).__printed === true, null, { timeout: 30_000 })
  // With a paper given, the page rule the app asked for is overridden by that paper: a browser
  // choosing its own, as Safari did in the Phase 0 print test.
  if (paper) {
    const [w, h] = paper.landscape ? ['11in', '8.5in'] : ['8.5in', '11in']
    const m = paper.margin
    await page.addStyleTag({ content: `@page { size: ${w} ${h} !important; margin: ${m.top} ${m.right} ${m.bottom} ${m.left} !important; }` })
  }
  const pdf = await page.pdf({ preferCSSPageSize: true })
  return { pdf, note: text ?? '' }
}

test.describe('Save as PDF in Chrome (and Edge)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'PDF output is written by Chromium; Firefox has its own test')
  test.setTimeout(120_000)

  test('the stress deck: one slide per page, exactly slide size, no blank pages, selectable text, vector charts and tables', async ({ page }, info) => {
    await openStress(page)
    const { pdf, note } = await savePdf(page)
    expect(note).toContain('Save as PDF')
    expect(note).toContain('the size of the slide')
    writeFileSync(info.outputPath('stress.pdf'), pdf)
    const pages = readPdf(pdf)
    const d = await deck(page)

    // One page per slide, every one 13.333 × 7.5 in (960 × 540 points).
    expect(pages).toHaveLength(STRESS.slides)
    for (const p of pages) {
      expect(p.size[0]).toBeCloseTo(960, 0)
      expect(p.size[1]).toBeCloseTo(540, 0)
    }
    // No blank pages: every page draws its slide's text.
    expect(pages.filter((p) => p.textBlocks === 0)).toHaveLength(0)
    // Selectable text: real text, in fonts that map back to characters.
    for (const p of pages) expect(p.fonts.length).toBeGreaterThan(0)
    expect(pages.flatMap((p) => p.fonts).every((f) => f.toUnicode)).toBe(true)

    // Charts and tables are vector: a chart or table slide has drawn paths and no picture; only
    // slides with a photo carry one.
    d.slides.forEach((slide: { elements: { type: string }[] }, i: number) => {
      const types = new Set(slide.elements.map((e) => e.type))
      const p = pages[i]
      if (types.has('chart') || types.has('table')) {
        expect(p.paths, `slide ${i + 1} vector drawing`).toBeGreaterThan(10)
        expect(p.images, `slide ${i + 1} pictures`).toBe(0)
      }
      if (types.has('image')) expect(p.images, `slide ${i + 1} picture`).toBeGreaterThanOrEqual(1)
    })
    info.annotations.push({ type: 'pdf', description: `${pages.length} pages, ${(pdf.length / 1e6).toFixed(1)} MB` })
  })
})

/** Firefox's built-in PDF viewer (pdf.js), turned on: it draws PDF pages for comparison. */
const PDF_VIEWER_PREFS = { 'pdfjs.disabled': false, 'browser.download.open_pdf_attachments_inline': true }

test.describe('the PDF matches the slide on screen', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'PDF output is written by Chromium')
  test.setTimeout(180_000)

  test('side by side: each kind of slide, as presented and as printed, pixel by pixel', async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await openStress(page)
    const { pdf } = await savePdf(page)
    const pdfPath = info.outputPath('stress.pdf')
    writeFileSync(pdfPath, pdf)

    // One slide of each kind.
    const d = await deck(page)
    const kinds = new Map<string, number>()
    d.slides.forEach((s: { elements: { type: string; chartType?: string }[] }, i: number) => {
      const types = s.elements.map((e) => (e.type === 'chart' ? `chart:${e.chartType}` : e.type))
      const kind = ['chart:bar', 'chart:line', 'chart:pie', 'table', 'image'].find((k) => types.includes(k)) ?? (i === 0 ? 'title' : 'text')
      if (!kinds.has(kind)) kinds.set(kind, i)
    })
    expect([...kinds.keys()].sort()).toEqual(['chart:bar', 'chart:line', 'chart:pie', 'image', 'table', 'text', 'title'])

    // On screen: presenting, where the slide is drawn at exactly 1280 × 720.
    await page.keyboard.press('Escape')
    const shots = new Map<string, string>()
    for (const [kind, index] of kinds) {
      await page.evaluate((i) => {
        window.__mySlidesPresent!.end()
        window.__mySlidesPresent!.present(i)
      }, index)
      await expect(page.locator('.present-stage')).toHaveAttribute('data-shown', String(index))
      await page.evaluate(() => document.fonts.ready)
      const png = await page.locator('.present-stage').screenshot({ animations: 'disabled' })
      shots.set(kind, png.toString('base64'))
    }
    await page.evaluate(() => window.__mySlidesPresent!.end())

    // In the PDF: each page drawn by Firefox's PDF viewer at the same size, then compared.
    const browser = await firefox.launch({ firefoxUserPrefs: PDF_VIEWER_PREFS, channel: undefined })
    try {
      const viewer = await browser.newPage()
      await viewer.goto(pathToFileURL(pdfPath).href)
      const results: Record<string, { differs: number; mean: number }> = {}
      // The last pair is a control: a slide against the wrong page must fail, or the test proves nothing.
      const pairs: [string, number, string][] = [...kinds].map(([kind, index]) => [kind, index, kind])
      pairs.push(['control: bar chart slide vs the table page', kinds.get('table')!, 'chart:bar'])
      for (const [kind, index, shotKind] of pairs) {
        results[kind] = await viewer.evaluate(
          async ({ index, shot }) => {
            const app = (window as unknown as { PDFViewerApplication: PdfViewer }).PDFViewerApplication
            await app.initializedPromise
            while (!app.pdfDocument) await new Promise((r) => setTimeout(r, 50))
            const page = await app.pdfDocument.getPage(index + 1)
            const viewport = page.getViewport({ scale: 1280 / 960 })
            const printed = document.createElement('canvas')
            printed.width = 1280
            printed.height = 720
            await page.render({ canvasContext: printed.getContext('2d')!, viewport }).promise
            const img = new Image()
            img.src = `data:image/png;base64,${shot}`
            await img.decode()
            const screen = document.createElement('canvas')
            screen.width = 1280
            screen.height = 720
            screen.getContext('2d')!.drawImage(img, 0, 0)
            const a = printed.getContext('2d')!.getImageData(0, 0, 1280, 720).data
            const b = screen.getContext('2d')!.getImageData(0, 0, 1280, 720).data
            let differs = 0
            let total = 0
            for (let i = 0; i < a.length; i += 4) {
              const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
              total += d
              if (d > 64) differs++
            }
            return { differs: differs / (a.length / 4), mean: total / (a.length / 4) }
          },
          { index, shot: shots.get(shotKind)! },
        )
      }
      // The text can be selected and copied: the viewer reads the words back out of the PDF.
      const words = await viewer.evaluate(async (pages) => {
        const app = (window as unknown as { PDFViewerApplication: PdfViewer }).PDFViewerApplication
        const out: string[] = []
        for (const n of pages) {
          const page = (await app.pdfDocument!.getPage(n)) as unknown as { getTextContent(): Promise<{ items: { str: string }[] }> }
          out.push((await page.getTextContent()).items.map((i) => i.str).join(' ').replace(/\s+/g, ' '))
        }
        return out
      }, [kinds.get('title')! + 1, kinds.get('chart:bar')! + 1])
      expect(words[0]).toContain('Stress deck: a year of science')
      expect(words[1]).toMatch(/Readings, week \d+/)
      info.annotations.push({ type: 'pdf vs screen', description: JSON.stringify(results) })
      console.log('pdf vs screen', JSON.stringify(results))
      const pass = (r: { differs: number; mean: number }) => r.differs < 0.005 && r.mean < 1.5
      for (const [kind, r] of Object.entries(results)) {
        // Text edges are smoothed a little differently by the two renderers; layout, colors,
        // text and pictures must agree: under half a percent of pixels clearly different.
        if (kind.startsWith('control')) expect(pass(r), `${kind} must not pass`).toBe(false)
        else expect(pass(r), `${kind}: ${JSON.stringify(r)}`).toBe(true)
      }
    } finally {
      await browser.close()
    }
  })
})

interface PdfViewer {
  initializedPromise: Promise<void>
  pdfDocument: {
    getPage(n: number): Promise<{
      getViewport(o: { scale: number }): unknown
      render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> }
    }>
  } | null
}

/** Make the app believe it runs in a browser without slide-sized pages (Firefox here). */
async function asFirefox(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined })
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0' })
  })
}

/** Where the slide sits on a page drawn by Firefox's PDF viewer: the box of everything not white. */
async function slideBoxes(pdfPath: string, pageNumbers: number[]) {
  const browser = await firefox.launch({ firefoxUserPrefs: PDF_VIEWER_PREFS, channel: undefined })
  try {
    const viewer = await browser.newPage()
    await viewer.goto(pathToFileURL(pdfPath).href)
    return await viewer.evaluate(async (numbers) => {
      const app = (window as unknown as { PDFViewerApplication: PdfViewer }).PDFViewerApplication
      await app.initializedPromise
      while (!app.pdfDocument) await new Promise((r) => setTimeout(r, 50))
      const out = []
      for (const n of numbers) {
        const page = await app.pdfDocument.getPage(n)
        const viewport = page.getViewport({ scale: 1 }) as { width: number; height: number }
        const c = document.createElement('canvas')
        c.width = Math.round(viewport.width)
        c.height = Math.round(viewport.height)
        const ctx = c.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport }).promise
        const px = ctx.getImageData(0, 0, c.width, c.height).data
        let [x0, y0, x1, y1] = [c.width, c.height, -1, -1]
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4
            if (px[i] < 250 || px[i + 1] < 250 || px[i + 2] < 250) {
              x0 = Math.min(x0, x)
              y0 = Math.min(y0, y)
              x1 = Math.max(x1, x)
              y1 = Math.max(y1, y)
            }
          }
        out.push({ page: [c.width, c.height], box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } })
      }
      return out
    }, pageNumbers)
  } finally {
    await browser.close()
  }
}

test.describe('fitted pages, for browsers that ignore the slide size', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'PDF output is written by Chromium')
  test.setTimeout(180_000)

  for (const landscape of [false, true]) {
    test(`a complete PDF on Letter ${landscape ? 'landscape' : 'portrait'}, every slide whole, one per page`, async ({ page }, info) => {
      // What Safari did in the Phase 0 print test: Letter portrait, the slide size ignored.
      await asFirefox(page)
      await openStress(page)
      const { pdf, note } = await savePdf(page, { format: 'Letter', landscape, margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' } })
      expect(note).toContain('can’t make pages the size of your slides')
      const pdfPath = info.outputPath('letter.pdf')
      writeFileSync(pdfPath, pdf)
      const pages = readPdf(pdf)
      expect(pages).toHaveLength(STRESS.slides)
      const [w, h] = landscape ? [792, 612] : [612, 792]
      for (const p of pages) {
        expect(p.size[0]).toBeCloseTo(w, 0)
        expect(p.size[1]).toBeCloseTo(h, 0)
      }
      expect(pages.filter((p) => p.textBlocks === 0)).toHaveLength(0)

      // Each slide sits whole inside the printable area (0.4 in = 28.8 pt margins), as wide as it
      // can be (the scale steps lose at most 8 px), at 16:9.
      const boxes = await slideBoxes(pdfPath, [1, 2, 15, 30, 60])
      const usable = w - 2 * 28.8
      for (const { box } of boxes) {
        expect(box.x).toBeGreaterThanOrEqual(28)
        expect(box.x + box.w).toBeLessThanOrEqual(w - 28)
        expect(box.w).toBeGreaterThan(usable - 8)
        expect(box.w / box.h).toBeCloseTo(16 / 9, 1)
      }
      info.annotations.push({ type: 'slide on page', description: JSON.stringify(boxes[0]) })
    })
  }
})

test.describe('fitted pages in the Firefox and Safari (WebKit) engines', () => {
  test.skip(({ browserName }) => browserName !== 'firefox', 'Run once, from the Firefox project')

  for (const engine of ['firefox', 'webkit'] as const) {
    test(`${engine}: the plain-words note, and each slide scales to the page width it is given, never wider`, async ({ page: ffPage, baseURL }) => {
      let page = ffPage
      let browser: Browser | null = null
      if (engine === 'webkit') {
        try {
          browser = await webkit.launch()
        } catch {
          test.skip(true, 'WebKit is not installed (npx playwright install webkit)')
        }
        page = await browser!.newPage({ baseURL })
      }
      try {
        await open(page)
        await page.evaluate(() => (window.print = () => {}))
        await page.keyboard.press('Escape')
        await page.keyboard.press('ControlOrMeta+p')
        // The plain-words note, every time in these browsers (no "Don't show this again").
        const note = page.getByRole('dialog', { name: 'Save as PDF' })
        await expect(note).toContainText('can’t make pages the size of your slides')
        await expect(note).toContainText('choose Landscape')
        await expect(note).toContainText('Chrome and Edge make pages exactly the size of your slides')
        await expect(note.getByRole('checkbox')).toHaveCount(0)
        await note.getByRole('button', { name: 'Continue' }).click()
        await page.emulateMedia({ media: 'print' })
        // Page widths: Letter portrait and landscape with Safari's and Firefox's margins, A4, and a narrow one.
        for (const width of [739, 979, 720, 1000, 480]) {
          await page.setViewportSize({ width, height: 900 })
          const r = await page.locator('.print-page').first().evaluate((el) => {
            const page = el.getBoundingClientRect()
            const slide = el.querySelector('.print-scale')!.getBoundingClientRect()
            return { page: page.width, pageH: page.height, slide: slide.width, slideH: slide.height }
          })
          expect(r.slide, `${engine} at ${width}px`).toBeLessThanOrEqual(r.page + 0.5)
          expect(r.slide, `${engine} at ${width}px`).toBeGreaterThan(r.page - 8.5)
          expect(r.slideH).toBeLessThanOrEqual(r.pageH + 0.5)
        }
      } finally {
        await browser?.close()
      }
    })
  }
})
