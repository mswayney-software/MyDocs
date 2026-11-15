import type { Align, PageSettings, PaperSize } from './native'

/**
 * Printing and Save as PDF.
 *
 * The browser's print dialog does the work. A generated @page rule sets the paper size and
 * margins, and its margin boxes (@top-right and so on) print the header, footer, and page
 * number on every page. Chrome and Edge support margin boxes from version 131; Firefox and
 * Safari print the page size and margins but not the margin boxes, so the student is told
 * before printing (see printWarning).
 */

export const PAPER: Record<PaperSize, { label: string; css: string; width: string; height: string }> = {
  letter: { label: 'Letter (8.5 × 11 in)', css: 'letter', width: '8.5in', height: '11in' },
  a4: { label: 'A4 (210 × 297 mm)', css: 'A4', width: '210mm', height: '297mm' },
}

export type Box ='top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** A CSS string literal. Header text is the student's, so it is escaped, never trusted. */
export function cssString(s: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what must go
  return `"${s.replace(/[\\"]/g, '\\$&').replace(/[\u0000-\u001f\u007f]/g, ' ')}"`
}

const boxFor = (edge: 'top' | 'bottom', align: Align): Box =>
  `${edge}-${align === 'center' ? 'center' : align}` as Box

/** What prints in each margin box: text, and the page number where it goes. */
export function marginParts(page: PageSettings): Partial<Record<Box, (string | 'page')[]>> {
  const parts: Partial<Record<Box, (string | 'page')[]>> = {}
  const add = (box: Box, ...value: (string | 'page')[]) => {
    const list = (parts[box] ??= [])
    // Header text and the page number in the same corner print as one line: "Notes Smith 3".
    if (list.length) list.push(' ')
    list.push(...value)
  }
  const header = page.header.trim()
  const footer = page.footer.trim()
  if (header) add(boxFor('top', page.headerAlign), header)
  if (footer) add(boxFor('bottom', page.footerAlign), footer)
  if (page.pageNumbers !== 'none') {
    const box: Box =
      page.pageNumbers === 'header-right' ? 'top-right' : page.pageNumbers === 'footer-right' ? 'bottom-right' : 'bottom-center'
    const prefix = page.pageNumberPrefix.trim()
    if (prefix) add(box, prefix + ' ', 'page')
    else add(box, 'page')
  }
  return parts
}

/** The CSS `content` of each margin box that prints something. */
export function marginBoxes(page: PageSettings): Partial<Record<Box, string>> {
  return Object.fromEntries(
    Object.entries(marginParts(page)).map(([box, v]) => [
      box,
      v.map((p) => (p === 'page' ? 'counter(page)' : cssString(p))).join(' '),
    ]),
  )
}

/** The text of each margin box on a given page, for the on-screen preview. */
export function marginText(page: PageSettings, pageNumber: number): Partial<Record<Box, string>> {
  return Object.fromEntries(
    Object.entries(marginParts(page)).map(([box, v]) => [box, v.map((p) => (p === 'page' ? String(pageNumber) : p)).join('')]),
  )
}

export const hasMarginContent = (page: PageSettings) => Object.keys(marginBoxes(page)).length > 0

/** The @page rule for this document. */
export function pageCss(page: PageSettings): string {
  const m = page.margins
  const boxes = Object.entries(marginBoxes(page))
    .map(([box, content]) => `  @${box} { content: ${content}; }`)
    .join('\n')
  return [
    '@page {',
    `  size: ${PAPER[page.paperSize].css};`,
    `  margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in;`,
    // Same font as the body, as MLA and APA require.
    "  font-family: 'Tinos', serif; font-size: 12pt; color: #000;",
    boxes,
    '}',
  ]
    .filter(Boolean)
    .join('\n')
}

let styleEl: HTMLStyleElement | null = null

/** Keep the document's @page rule in the page, so Ctrl+P from the browser menu prints right too. */
export function applyPageStyle(page: PageSettings) {
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'page-setup'
    document.head.append(styleEl)
  }
  styleEl.textContent = pageCss(page)
}

let marginBoxSupport: boolean | undefined

/** Whether this browser prints @page margin boxes (headers, footers, page numbers). */
export function supportsMarginBoxes(): boolean {
  if (marginBoxSupport !== undefined) return marginBoxSupport
  try {
    // A browser that understands margin boxes keeps them as rules inside the @page rule.
    const sheet = new CSSStyleSheet()
    sheet.replaceSync('@page { @top-right { content: "x"; } }')
    const rule = sheet.cssRules[0] as CSSRule & { cssRules?: CSSRuleList }
    marginBoxSupport = (rule?.cssRules?.length ?? 0) > 0
  } catch {
    marginBoxSupport = false
  }
  return marginBoxSupport
}
