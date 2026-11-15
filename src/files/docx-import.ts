import type { JSONContent } from '@tiptap/core'
import { DOMParser as PMDOMParser, type Schema } from '@tiptap/pm/model'
import { DEFAULT_FONT, DEFAULT_FONT_SIZE } from '../editor/fonts'
import {
  bodyFont, pageNumberPosition, readImageSizes, readMargin, readParagraphs, readRels, readRuns, readSection, readStyles,
  type ParaLayout, type RunLook,
} from './docx-xml'
import { imageFileToDataUrl, fitToPage } from './images'
import { DEFAULT_PAGE, OpenError, readPage, type PageSettings } from './native'

/**
 * Word import. mammoth turns the .docx into HTML (text, headings, lists, tables, images,
 * bold and so on), and the editor reads that HTML the way it reads a paste. What mammoth
 * leaves out, read from the file's XML here: paragraph alignment, indents and spacing, page
 * breaks, the body font, paper size, margins, header, footer and page numbers.
 *
 * The original file is only read, never written: it opens as a new, unsaved document.
 * Both libraries load only when a Word file is opened.
 */

/** A paragraph's layout travels through mammoth as an invisible marker at its start. */
const MARK_OPEN = ''
const MARK_CLOSE = ''
/** A run's direct formatting: open marker, its JSON, separator, the run's text, close marker. */
const RUN_OPEN = ''
const RUN_SEP = ''
const RUN_CLOSE = ''

const STYLE_MAP = [
  "p[style-name='Title'] => p.ow-title:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Table Heading'] => p:fresh",
  "p[style-name='List Continue'] => p.ow-continue-1:fresh",
  "p[style-name='List Continue 2'] => p.ow-continue-2:fresh",
  "p[style-name='List Continue 3'] => p.ow-continue-3:fresh",
  "p[style-name='List Continue 4'] => p.ow-continue-4:fresh",
  "p[style-name='List Continue 5'] => p.ow-continue-5:fresh",
  "p[style-name='Heading 4'] => h3:fresh",
  "p[style-name='Heading 5'] => h3:fresh",
  "p[style-name='Heading 6'] => h3:fresh",
  "br[type='page'] => hr.ow-page-break",
  'u => u',
  'strike => s',
]

export interface ImportedDocx {
  doc: JSONContent
  page: PageSettings
}

export async function importDocx(data: ArrayBuffer, schema: Schema): Promise<ImportedDocx> {
  const [{ default: JSZip }, mammothModule] = await Promise.all([import('jszip'), import('mammoth')])
  const mammoth = (mammothModule as unknown as { default?: typeof mammothModule }).default ?? mammothModule

  let zip
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    throw new OpenError('not-ours', "This file isn't a Word document, or it is damaged.")
  }
  const part = (path: string) => zip.file(path)?.async('string') ?? Promise.resolve(null)
  const documentXml = await part('word/document.xml')
  if (!documentXml) throw new OpenError('not-ours', "This file isn't a Word document, or it is damaged.")
  const [stylesXml, themeXml, relsXml] = await Promise.all([
    part('word/styles.xml'),
    part('word/theme/theme1.xml'),
    part('word/_rels/document.xml.rels'),
  ])

  const styles = readStyles(stylesXml, themeXml)
  const layouts = readParagraphs(documentXml, styles)
  const runs = readRuns(documentXml, themeXml)
  const imageSizes = readImageSizes(documentXml)
  const page = await readPageSettings(documentXml, relsXml, part)

  let imageIndex = 0
  let layoutsMatched = false
  let result
  try {
    result = await mammoth.convertToHtml(
      { arrayBuffer: data },
      {
        styleMap: STYLE_MAP,
        ignoreEmptyParagraphs: false, // students use blank lines for spacing
        transformDocument: (document: unknown) => {
          markRuns(document, runs)
          const marked = markParagraphs(document, layouts)
          layoutsMatched = marked.matched
          return marked.document
        },
        convertImage: mammoth.images.imgElement(async (image) => {
          const index = imageIndex++
          try {
            const buf = await image.readAsArrayBuffer()
            const file = new File([buf], 'image', { type: image.contentType })
            const img = await imageFileToDataUrl(file)
            return { src: img.src, 'data-ow-img': String(index), 'data-w': String(img.width), 'data-h': String(img.height) } as { src: string }
          } catch {
            return { src: '' } // a format the browser can't show (EMF, WMF): left out
          }
        }),
      },
    )
  } catch {
    throw new OpenError('damaged', 'This Word document is damaged and could not be opened.')
  }

  const html = finishHtml(result.value, imageIndex === imageSizes.length ? imageSizes : null)
  const container = document.createElement('div')
  container.innerHTML = html
  // Keep tabs and runs of spaces as typed.
  const doc = PMDOMParser.fromSchema(schema).parse(container, { preserveWhitespace: true })
  // Fonts come with each paragraph's layout; when those couldn't be matched, use the body font.
  const json = layoutsMatched ? (doc.toJSON() as JSONContent) : applyBodyFont(doc.toJSON() as JSONContent, bodyFont(styles), styles.size)
  return { doc: json, page }
}

// ---- paragraph layout through mammoth --------------------------------------------------------

interface MammothElement {
  type: string
  children?: MammothElement[]
  alignment?: string | null
  indent?: { start?: string | null; firstLine?: string | null; hanging?: string | null }
  [key: string]: unknown
}

/**
 * Put each paragraph's layout at its start, as a marker finishHtml turns back into styles.
 * The XML layouts line up with mammoth's paragraphs only if the counts match; when they
 * don't (unusual content), mammoth's own alignment and indents are used instead.
 */
function markParagraphs(document: unknown, layouts: ParaLayout[]) {
  const paragraphs: MammothElement[] = []
  const walk = (el: MammothElement) => {
    if (el.type === 'paragraph') paragraphs.push(el)
    el.children?.forEach(walk)
  }
  walk(document as MammothElement)
  const aligned = paragraphs.length === layouts.length && layouts.length > 0
  paragraphs.forEach((p, i) => {
    const layout = aligned ? layouts[i] : fromMammoth(p)
    const encoded = encodeLayout(layout)
    if (!encoded) return
    const marker: MammothElement = {
      type: 'run',
      children: [{ type: 'text', value: MARK_OPEN + encoded + MARK_CLOSE }],
      styleId: null,
      styleName: null,
      isBold: false,
      isUnderline: false,
      isItalic: false,
      isStrikethrough: false,
      isAllCaps: false,
      isSmallCaps: false,
      verticalAlignment: 'baseline',
      font: null,
      fontSize: null,
      highlight: null,
    }
    p.children = [marker, ...(p.children ?? [])]
  })
  return { document, matched: aligned }
}

/** Wrap each run's text in markers carrying its font, size, color and highlight. */
function markRuns(document: unknown, looks: RunLook[]) {
  const runs: MammothElement[] = []
  const walk = (el: MammothElement) => {
    if (el.type === 'run') runs.push(el)
    el.children?.forEach(walk)
  }
  walk(document as MammothElement)
  // Without a one-to-one match, guessing would put formatting on the wrong text.
  if (runs.length !== looks.length) return
  runs.forEach((run, i) => {
    const look = looks[i]
    if (!Object.keys(look).length || !run.children?.some((c) => c.type === 'text' || c.type === 'tab')) return
    run.children = [
      { type: 'text', value: RUN_OPEN + JSON.stringify(look) + RUN_SEP },
      ...run.children,
      { type: 'text', value: RUN_CLOSE },
    ]
  })
}

function fromMammoth(p: MammothElement): ParaLayout {
  const align = { center: 'center', right: 'right', end: 'right', both: 'justify' }[p.alignment ?? ''] as ParaLayout['align']
  const n = (v: string | null | undefined) => (v ? Number(v) / 1440 : 0)
  const layout: ParaLayout = {}
  if (align) layout.align = align
  if (n(p.indent?.start)) layout.indent = n(p.indent?.start)
  if (n(p.indent?.firstLine)) layout.firstLine = n(p.indent?.firstLine)
  else if (n(p.indent?.hanging)) layout.firstLine = -n(p.indent?.hanging)
  return layout
}

const encodeLayout = (l: ParaLayout) => (Object.keys(l).length ? JSON.stringify(l) : '')

/** CSS the editor reads back into paragraph attributes (see paragraph-format.ts). */
function layoutStyle(l: ParaLayout, list: boolean): string {
  const s: string[] = []
  if (l.align) s.push(`text-align: ${l.align}`)
  if (l.heading || list) return s.join('; ') // lists and headings keep their own spacing
  if (l.indent) s.push(`margin-left: ${l.indent}in`)
  if (l.firstLine) s.push(`text-indent: ${l.firstLine}in`)
  if (l.lineHeight) s.push(`line-height: ${l.lineHeight}`)
  if (l.spaceBefore) s.push(`margin-top: ${l.spaceBefore}pt`)
  if (l.spaceAfter) s.push(`margin-bottom: ${l.spaceAfter}pt`)
  return s.join('; ')
}

/** Turn mammoth's HTML into HTML the editor parses: markers to styles, our classes to our nodes. */
export function finishHtml(html: string, imageSizes: { width: number; height: number }[] | null): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const body = doc.body

  // Paragraph layouts.
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.includes(MARK_OPEN)) texts.push(n as Text)
  for (const t of texts) {
    const value = t.nodeValue ?? ''
    const start = value.indexOf(MARK_OPEN)
    const end = value.indexOf(MARK_CLOSE, start)
    if (end < 0) continue
    let layout: ParaLayout = {}
    try {
      layout = JSON.parse(value.slice(start + 1, end))
    } catch {
      // not ours after all
    }
    t.nodeValue = value.slice(0, start) + value.slice(end + 1)
    const block = t.parentElement?.closest('p, h1, h2, h3, h4, h5, h6, li')
    if (!block) continue
    const headingBlock = /^H[1-6]$/.test(block.tagName) || block.classList.contains('ow-title')
    const style = layoutStyle(headingBlock ? { ...layout, heading: true } : layout, block.tagName === 'LI' || !!block.closest('li') || /ow-continue/.test(block.className))
    if (style) block.setAttribute('style', style)
    if (layout.list) block.closest('li')?.setAttribute('data-ow-list', layout.list)
    applyFont(block, layout)
    if (layout.pageBreakBefore && !block.closest('li, td, th')) block.before(pageBreak(doc))
  }

  applyRunLooks(doc)
  continueLists(body)
  splitLists(body)

  // Empty headings (blank lines styled as headings) are plain blank lines.
  for (const h of Array.from(body.querySelectorAll('h1, h2, h3, h4, h5, h6, p.ow-title'))) {
    if (h.textContent?.trim() || h.querySelector('img')) continue
    const p = doc.createElement('p')
    h.replaceWith(p)
  }

  // Title paragraphs.
  for (const p of Array.from(body.querySelectorAll('p.ow-title'))) {
    p.removeAttribute('class')
    p.setAttribute('data-type', 'title')
  }

  // Page breaks: mammoth puts them inside the paragraph; split it there.
  for (const hr of Array.from(body.querySelectorAll('hr.ow-page-break'))) {
    if (hr.closest('li, td, th')) {
      hr.remove()
      continue
    }
    const block = hr.closest('p, h1, h2, h3')
    if (!block) {
      hr.replaceWith(pageBreak(doc))
      continue
    }
    // Everything after the break (keeping its bold, italics and so on) moves to a new block.
    const range = doc.createRange()
    range.setStartAfter(hr)
    range.setEnd(block, block.childNodes.length)
    const after = block.cloneNode(false) as Element
    after.removeAttribute('data-type') // a title continues as body text
    after.append(range.extractContents())
    hr.remove()
    block.after(pageBreak(doc))
    if (after.textContent || after.querySelector('img')) block.nextElementSibling!.after(after)
    if (!block.textContent && !block.querySelector('img')) block.remove()
  }

  // Images: their size as shown in Word, kept within the page.
  for (const img of Array.from(body.querySelectorAll('img'))) {
    if (!img.getAttribute('src')) {
      img.remove()
      continue
    }
    const i = Number(img.getAttribute('data-ow-img'))
    const shown = imageSizes?.[i] ?? { width: Number(img.getAttribute('data-w')) || 300, height: Number(img.getAttribute('data-h')) || 200 }
    const fit = fitToPage({ src: '', ...shown })
    img.setAttribute('width', String(fit.width))
    img.setAttribute('height', String(fit.height))
    for (const a of ['data-ow-img', 'data-w', 'data-h']) img.removeAttribute(a)
    // Word's alt text can hold line breaks; the editor's is one line.
    const alt = img.getAttribute('alt')
    if (alt) img.setAttribute('alt', alt.replace(/\s+/g, ' ').trim())
    // Images are blocks in the editor; one inside a paragraph keeps the paragraph's alignment.
    const p = img.closest('p')
    const align = p && (p as HTMLElement).style.textAlign
    if (align === 'center' || align === 'right' || align === 'left') img.setAttribute('data-align', align)
  }
  // A paragraph holding only images becomes the images (they are blocks in the editor).
  for (const p of Array.from(body.querySelectorAll('p'))) {
    if (!p.querySelector('img') || p.textContent?.trim()) continue
    p.replaceWith(...Array.from(p.querySelectorAll('img')))
  }

  // Footnote and bookmark links point inside the document; they keep their text only.
  for (const a of Array.from(body.querySelectorAll('a[href^="#"]'))) a.replaceWith(...Array.from(a.childNodes))
  // mammoth's footnote back-links ("↑").
  for (const a of Array.from(body.querySelectorAll('a[id^="footnote-ref"], a[id^="endnote-ref"]'))) a.removeAttribute('id')

  return body.innerHTML
}

/** Turn run markers into spans (font, size, color) and marks (highlight) around the run's text. */
function applyRunLooks(doc: Document) {
  const nextMarker = (from: Node | null, ch: string): { node: Text; at: number } | null => {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    if (from) walker.currentNode = from
    for (let n = from ? walker.currentNode : walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.nodeValue?.indexOf(ch) ?? -1
      if (at >= 0) return { node: n as Text, at }
    }
    return null
  }
  for (let open = nextMarker(null, RUN_OPEN); open; open = nextMarker(open.node, RUN_OPEN)) {
    const value = open.node.nodeValue ?? ''
    const sep = value.indexOf(RUN_SEP, open.at)
    if (sep < 0) break
    let look: RunLook = {}
    try {
      look = JSON.parse(value.slice(open.at + 1, sep))
    } catch {
      // not ours
    }
    // Split off the run's text and drop the opening marker.
    const start = open.node.splitText(sep + 1)
    open.node.nodeValue = value.slice(0, open.at)
    const close = nextMarker(start, RUN_CLOSE)
    if (!close) break
    const rest = close.node.splitText(close.at)
    rest.nodeValue = (rest.nodeValue ?? '').slice(1)
    const css: string[] = []
    if (look.font) css.push(`font-family: '${look.font.replace(/'/g, '')}'`)
    if (look.size) css.push(`font-size: ${look.size}pt`)
    if (look.color && look.color !== '#000000') css.push(`color: ${look.color}`)
    if (!css.length && !look.highlight) {
      open = { node: rest, at: 0 }
      continue
    }
    const range = doc.createRange()
    range.setStartBefore(start)
    range.setEndBefore(rest)
    let wrapper: Element = doc.createElement('span')
    if (css.length) wrapper.setAttribute('style', css.join('; '))
    const inner = wrapper
    if (look.highlight) {
      const mark = doc.createElement('mark')
      mark.setAttribute('data-color', look.highlight)
      if (css.length) inner.append(mark)
      else wrapper = mark
      mark.append(range.extractContents())
    } else inner.append(range.extractContents())
    range.insertNode(wrapper)
    open = { node: rest, at: 0 }
  }
}

/** The editor's own size for each kind of block, in points (index.css). */
const BLOCK_SIZE: Record<string, number> = { H1: 18, H2: 14, H3: 12 }
const TITLE_SIZE = 26

/**
 * Give a block the font and size its Word style had, where they differ from the editor's own
 * style for that block. An APA heading styled 12 pt stays 12 pt instead of becoming 18 pt.
 */
function applyFont(block: Element, layout: ParaLayout) {
  const own = block.classList.contains('ow-title') ? TITLE_SIZE : (BLOCK_SIZE[block.tagName] ?? DEFAULT_FONT_SIZE)
  const css: string[] = []
  if (layout.size && layout.size !== own) css.push(`font-size: ${layout.size}pt`)
  if (layout.font && layout.font !== DEFAULT_FONT) css.push(`font-family: '${layout.font.replace(/'/g, '')}'`)
  if (!css.length) return
  // Wrap the block's text, but not lists nested inside a list item.
  const span = block.ownerDocument.createElement('span')
  span.setAttribute('style', css.join('; '))
  const inline = Array.from(block.childNodes)
  const stop = inline.findIndex((n) => n instanceof Element && /^(UL|OL|P|TABLE|DIV|H[1-6])$/.test(n.tagName))
  const move = stop < 0 ? inline : inline.slice(0, stop)
  if (!move.length) return
  move[0].before(span)
  span.append(...move)
}

/**
 * A "List Continue" paragraph is a second paragraph of the list item above it; mammoth ends
 * the list there. Put it back in the item, and join the list that continues after it.
 */
function continueLists(body: HTMLElement) {
  for (const p of Array.from(body.querySelectorAll('p[class^="ow-continue-"]'))) {
    const level = Number(p.className.slice('ow-continue-'.length)) || 1
    p.removeAttribute('class')
    const list = p.previousElementSibling
    if (!list || !/^(OL|UL)$/.test(list.tagName)) continue
    // The last item at that depth.
    let item = list.lastElementChild
    for (let depth = 1; depth < level && item; depth++) {
      const nested = Array.from(item.children).filter((c) => /^(OL|UL)$/.test(c.tagName)).at(-1)
      if (!nested?.lastElementChild) break
      item = nested.lastElementChild
    }
    if (!item) continue
    // mammoth writes an item's own text without a <p>; wrap it so the item holds two paragraphs.
    if (!Array.from(item.children).some((c) => c.tagName === 'P')) {
      const first = item.ownerDocument.createElement('p')
      const inline = Array.from(item.childNodes).filter((n) => !(n instanceof Element && /^(OL|UL)$/.test(n.tagName)))
      first.append(...inline)
      item.prepend(first)
    }
    const nestedList = Array.from(item.children).find((c) => /^(OL|UL)$/.test(c.tagName))
    if (nestedList) nestedList.before(p)
    else item.append(p)
    // The same list goes on after the paragraph: one list again.
    const next = list.nextElementSibling
    if (next && next.tagName === list.tagName) {
      const lastId = list.querySelector(':scope > li:last-child')?.getAttribute('data-ow-list')
      const nextId = next.querySelector(':scope > li:first-child')?.getAttribute('data-ow-list')
      if (!lastId || !nextId || lastId === nextId) {
        list.append(...Array.from(next.children))
        next.remove()
      }
    }
  }
}

/**
 * mammoth joins neighboring list paragraphs into one list even when Word has them as two
 * separate lists (two numbered lists in a row, each starting at 1). Split them again.
 */
function splitLists(body: HTMLElement) {
  for (const list of Array.from(body.querySelectorAll('ol, ul'))) {
    let current = list
    let prevId: string | null = null
    for (const li of Array.from(list.children)) {
      if (li.tagName !== 'LI') continue
      const id = li.getAttribute('data-ow-list')
      li.removeAttribute('data-ow-list')
      if (prevId && id && id !== prevId && li.parentElement === current) {
        const next = current.cloneNode(false) as Element
        let n: Element | null = li
        while (n) {
          const after: Element | null = n.nextElementSibling
          next.append(n)
          n = after
        }
        current.after(next)
        current = next
      }
      if (id) prevId = id
    }
  }
}

function pageBreak(doc: Document) {
  const div = doc.createElement('div')
  div.setAttribute('data-type', 'page-break')
  return div
}

/** The document's body font and size, applied to body text where it differs from ours. */
function applyBodyFont(json: JSONContent, font: string | undefined, size: number | undefined): JSONContent {
  const family = font && font !== DEFAULT_FONT ? font : null
  const fontSize = size && size !== DEFAULT_FONT_SIZE ? `${size}pt` : null
  if (!family && !fontSize) return json
  const visit = (node: JSONContent, inHeading: boolean): JSONContent => {
    const heading = inHeading || node.type === 'heading' || node.type === 'title'
    if (node.type === 'text' && !heading) {
      const marks = [...(node.marks ?? [])]
      const i = marks.findIndex((m) => m.type === 'textStyle')
      const attrs = { fontFamily: family, fontSize, color: null, ...(i >= 0 ? defined(marks[i].attrs ?? {}) : {}) }
      if (i >= 0) marks[i] = { type: 'textStyle', attrs }
      else marks.push({ type: 'textStyle', attrs })
      return { ...node, marks }
    }
    return node.content ? { ...node, content: node.content.map((c) => visit(c, heading)) } : node
  }
  return visit(json, false)
}

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null))

// ---- page settings ---------------------------------------------------------------------------

async function readPageSettings(
  documentXml: string,
  relsXml: string | null,
  part: (path: string) => Promise<string | null>,
): Promise<PageSettings> {
  const section = readSection(documentXml)
  const rels = readRels(relsXml)
  const settings: Record<string, unknown> = { ...DEFAULT_PAGE, paperSize: section.paperSize, margins: section.margins }
  for (const [edge, rel] of [['top', section.headerRel], ['bottom', section.footerRel]] as const) {
    const path = rel && rels.get(rel)
    const xmlText = path ? await part(path) : null
    const info = xmlText ? readMargin(xmlText) : null
    if (!info) continue
    // Alignment only matters when there is text; otherwise keep the default.
    if (edge === 'top') {
      settings.header = info.text
      if (info.text) settings.headerAlign = info.align
    } else {
      settings.footer = info.text
      if (info.text) settings.footerAlign = info.align
    }
    if (info.pageNumber && settings.pageNumbers === 'none') {
      settings.pageNumbers = pageNumberPosition(edge, info.pageNumber.align)
      settings.pageNumberPrefix = info.pageNumber.prefix
    }
  }
  return readPage(settings)
}

