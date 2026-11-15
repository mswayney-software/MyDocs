import type { JSONContent } from '@tiptap/core'
import type {
  IParagraphOptions,
  IRunOptions,
  ParagraphChild,
  Paragraph as ParagraphType,
  Table as TableType,
} from 'docx'
import type { PageSettings } from './native'
import { marginParts, type Box } from './print'

/**
 * Word export. Walks the document JSON and builds the .docx directly (no HTML in between),
 * with the same sizes and spacing the editor shows, so a paper looks the same in Word.
 *
 * The docx library is loaded only when a student exports, so it never slows down startup;
 * the service worker still caches it for offline use.
 */

type Docx = typeof import('docx')

/** Twentieths of a point, Word's unit for page geometry and spacing. */
export const TWIPS_PER_INCH = 1440
const twips = (inches: number) => Math.round(inches * TWIPS_PER_INCH)
/** CSS pixels (96 per inch) to twips. */
const pxToTwips = (px: number) => Math.round((px * TWIPS_PER_INCH) / 96)

export const PAPER_TWIPS = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
} as const

/** Bundled fonts are saved under the names Word knows, which they are metric-compatible with. */
export const WORD_FONT: Record<string, string> = { Tinos: 'Times New Roman', Arimo: 'Arial', Carlito: 'Calibri' }
const wordFont = (name: string) => WORD_FONT[name] ?? name

/** Highlight colors offered by the toolbar, by their Word names. */
const HIGHLIGHT: Record<string, 'yellow' | 'green' | 'cyan' | 'magenta' | 'lightGray'> = {
  '#ffff00': 'yellow',
  '#00ff00': 'green',
  '#00ffff': 'cyan',
  '#ff00ff': 'magenta',
  '#d3d3d3': 'lightGray',
}

/** Font size in half-points from a CSS size ("14pt", "16px"); undefined if unreadable. */
export function halfPoints(size: unknown): number | undefined {
  if (typeof size !== 'string') return undefined
  const m = size.trim().match(/^([\d.]+)\s*(pt|px)?$/)
  if (!m) return undefined
  const pt = m[2] === 'px' ? (Number(m[1]) * 72) / 96 : Number(m[1])
  return Number.isFinite(pt) && pt > 0 ? Math.round(pt * 2) : undefined
}

// Style values shared with index.css (.doc and its headings). Keep them in step.
const BODY_FONT = 'Times New Roman'
const BODY_SIZE = 24 // 12 pt
const BODY_LINE = 276 // 1.15 lines
const LIST_INDENT = 720 // 0.5 in per level
const QUOTE_INDENT = 720

interface Ctx {
  d: Docx
  /** Usable width between the margins, in twips. */
  width: number
  listLevel: number
  /** Numbering instance of the ordered list being written, so each list starts at 1. */
  instance: number
  quoteDepth: number
  /** Inside a table header cell: text is bold, as on screen. */
  header: boolean
  /** A page break is waiting for the next paragraph. */
  breakBefore: boolean
  nextInstance: () => number
}

type Block = ParagraphType | TableType

export async function exportDocx(doc: JSONContent, page: PageSettings, title: string): Promise<Blob> {
  const d = await import('docx')
  const paper = PAPER_TWIPS[page.paperSize]
  const m = page.margins
  const width = paper.width - twips(m.left) - twips(m.right)
  let instances = 0
  const ctx: Ctx = {
    d,
    width,
    listLevel: -1,
    instance: 0,
    quoteDepth: 0,
    header: false,
    breakBefore: false,
    nextInstance: () => ++instances,
  }
  const children = await blocks(doc.content ?? [], ctx)
  // A break after the last block still needs somewhere to land.
  if (ctx.breakBefore) children.push(new d.Paragraph({ children: [new d.PageBreak()] }))
  if (!children.length) children.push(new d.Paragraph({}))

  const doc_ = new d.Document({
    title,
    creator: 'Open Writer',
    lastModifiedBy: 'Open Writer',
    styles: styles(d),
    numbering: numbering(d),
    sections: [
      {
        properties: {
          page: {
            size: { width: paper.width, height: paper.height },
            margin: {
              top: twips(m.top),
              right: twips(m.right),
              bottom: twips(m.bottom),
              left: twips(m.left),
              // The header sits halfway into the top margin, as it prints (MLA: half an inch).
              header: twips(m.top / 2),
              footer: twips(m.bottom / 2),
            },
          },
        },
        headers: marginParagraph(d, page, 'top', width),
        footers: marginParagraph(d, page, 'bottom', width),
        children,
      },
    ],
  })
  return d.Packer.toBlob(doc_)
}

/** Header or footer: one line with left, center and right parts, laid out with tab stops. */
function marginParagraph(d: Docx, page: PageSettings, edge: 'top' | 'bottom', width: number) {
  const parts = marginParts(page)
  const cells = (['left', 'center', 'right'] as const).map((a) => parts[`${edge}-${a}` as Box] ?? [])
  if (cells.every((c) => !c.length)) return undefined
  const runs: ParagraphChild[] = []
  cells.forEach((cell, i) => {
    if (i > 0) runs.push(new d.TextRun({ children: [new d.Tab()] }))
    for (const part of cell) {
      runs.push(part === 'page' ? new d.TextRun({ children: [d.PageNumber.CURRENT] }) : new d.TextRun(part))
    }
  })
  const paragraph = new d.Paragraph({
    tabStops: [
      { type: d.TabStopType.CENTER, position: Math.round(width / 2) },
      { type: d.TabStopType.RIGHT, position: width },
    ],
    children: runs,
  })
  const Kind = edge === 'top' ? d.Header : d.Footer
  return { default: new Kind({ children: [paragraph] }) }
}

function styles(d: Docx) {
  const heading = (size: number, before: number, after: number, italics = false) => ({
    run: { font: BODY_FONT, size, bold: true, italics, color: '000000' },
    paragraph: { spacing: { before: before * 20, after: after * 20, line: BODY_LINE }, keepNext: true },
  })
  return {
    default: {
      document: {
        run: { font: BODY_FONT, size: BODY_SIZE },
        paragraph: { spacing: { before: 0, after: 0, line: BODY_LINE, lineRule: d.LineRuleType.AUTO } },
      },
      title: {
        run: { font: BODY_FONT, size: 52, bold: false, color: '000000' },
        paragraph: { spacing: { after: 240, line: BODY_LINE } },
      },
      heading1: heading(36, 12, 6),
      heading2: heading(28, 12, 4),
      heading3: heading(24, 10, 4, true),
      hyperlink: { run: { color: '1F4E9E', underline: { type: d.UnderlineType.SINGLE } } },
    },
    paragraphStyles: [
      {
        id: 'Quote',
        name: 'Quote',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        paragraph: { indent: { left: QUOTE_INDENT } },
      },
      ...[1, 2, 3, 4, 5].map((n) => ({
        id: n === 1 ? 'ListContinue' : `ListContinue${n}`,
        name: n === 1 ? 'List Continue' : `List Continue ${n}`,
        basedOn: 'Normal',
        paragraph: { indent: { left: LIST_INDENT * n } },
      })),
      // Header cells are bold on screen; a style keeps that out of the text's own formatting.
      { id: 'TableHeading', name: 'Table Heading', basedOn: 'Normal', next: 'Normal', run: { bold: true } },
    ],
  }
}

function numbering(d: Docx) {
  const levels = (ordered: boolean) =>
    Array.from({ length: 9 }, (_, level) => ({
      level,
      format: ordered
        ? [d.LevelFormat.DECIMAL, d.LevelFormat.LOWER_LETTER, d.LevelFormat.LOWER_ROMAN][level % 3]
        : d.LevelFormat.BULLET,
      text: ordered ? `%${level + 1}.` : ['•', '◦', '▪'][level % 3],
      alignment: d.AlignmentType.LEFT,
      style: { paragraph: { indent: { left: LIST_INDENT * (level + 1), hanging: 360 } } },
    }))
  return {
    config: [
      { reference: 'bullets', levels: levels(false) },
      { reference: 'numbers', levels: levels(true) },
    ],
  }
}

async function blocks(nodes: JSONContent[], ctx: Ctx): Promise<Block[]> {
  const out: Block[] = []
  for (const node of nodes) out.push(...(await block(node, ctx)))
  return out
}

async function block(node: JSONContent, ctx: Ctx): Promise<Block[]> {
  const { d } = ctx
  switch (node.type) {
    case 'paragraph':
      return [paragraph(node, ctx, {})]
    case 'title':
      return [paragraph(node, ctx, { style: 'Title' })]
    case 'heading': {
      const level = Number(node.attrs?.level) || 1
      const heading = [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3][Math.min(3, level) - 1]
      return [paragraph(node, ctx, { heading })]
    }
    case 'blockquote': {
      // Paragraphs in a quote use Word's "Quote" style, so the quote comes back as a quote.
      ctx.quoteDepth++
      const inner = await blocks(node.content ?? [], ctx)
      ctx.quoteDepth--
      return inner
    }
    case 'bulletList':
    case 'orderedList':
      return list(node, ctx)
    case 'table':
      return [await table(node, ctx)]
    case 'image':
      return [await image(node, ctx)]
    case 'pageBreak':
      ctx.breakBefore = true
      return []
    default:
      // Anything unexpected keeps its text rather than disappearing.
      return node.content ? [paragraph({ type: 'paragraph', content: node.content.filter((c) => c.type === 'text') }, ctx, {})] : []
  }
}

async function list(node: JSONContent, ctx: Ctx): Promise<Block[]> {
  const ordered = node.type === 'orderedList'
  const saved = { level: ctx.listLevel, instance: ctx.instance }
  ctx.listLevel++
  // A numbered list restarts at 1 unless it sits inside another numbered list.
  if (ordered && !(saved.level >= 0 && saved.instance > 0)) ctx.instance = ctx.nextInstance()
  // Each top-level bulleted list is its own Word list too, so two in a row stay two.
  if (!ordered && saved.level < 0) ctx.instance = ctx.nextInstance()
  const out: Block[] = []
  for (const item of node.content ?? []) {
    let first = true
    for (const child of item.content ?? []) {
      if (child.type === 'paragraph' && first) {
        first = false
        out.push(
          paragraph(child, ctx, {
            numbering: { reference: ordered ? 'numbers' : 'bullets', level: Math.min(8, ctx.listLevel), instance: ctx.instance },
          }),
        )
      } else if (child.type === 'paragraph') {
        // A second paragraph in the same item lines up with the text above it. Word's
        // "List Continue" styles say so, and bring it back into the item when reopened.
        const level = Math.min(4, ctx.listLevel)
        out.push(paragraph(child, ctx, { style: level ? `ListContinue${level + 1}` : 'ListContinue' }))
      } else {
        out.push(...(await block(child, ctx)))
      }
    }
  }
  ctx.listLevel = saved.level
  ctx.instance = saved.instance
  return out
}

/** Paragraph-level formatting from the editor's attributes. */
function paragraphProps(node: JSONContent, ctx: Ctx, extra: Partial<IParagraphOptions>): Partial<IParagraphOptions> {
  const a = node.attrs ?? {}
  const align = a.textAlign === 'center' ? 'center' : a.textAlign === 'right' ? 'right' : a.textAlign === 'justify' ? 'both' : undefined
  const spacing: Record<string, number> = {}
  if (typeof a.lineHeight === 'number') spacing.line = Math.round(a.lineHeight * 240)
  if (typeof a.spaceBefore === 'number') spacing.before = Math.round(a.spaceBefore * 20)
  if (typeof a.spaceAfter === 'number') spacing.after = Math.round(a.spaceAfter * 20)
  const indent: Record<string, number> = {}
  // The Quote style indents the first level; deeper quotes add to it.
  const left = (typeof a.indent === 'number' ? twips(a.indent) : 0) + Math.max(0, ctx.quoteDepth - 1) * QUOTE_INDENT
  if (left) indent.left = left
  if (typeof a.firstLine === 'number' && a.firstLine > 0) indent.firstLine = twips(a.firstLine)
  if (typeof a.firstLine === 'number' && a.firstLine < 0) indent.hanging = twips(-a.firstLine)
  const props: Record<string, unknown> = { ...extra }
  if (ctx.quoteDepth > 0 && !extra.style && !extra.heading && !extra.numbering) props.style = 'Quote'
  if (ctx.header && !extra.style) props.style = 'TableHeading'
  if (align) props.alignment = align
  if (Object.keys(spacing).length) props.spacing = { ...spacing, ...(spacing.line ? { lineRule: ctx.d.LineRuleType.AUTO } : {}) }
  if (Object.keys(indent).length) props.indent = { ...(extra.indent as object), ...indent }
  if (ctx.breakBefore) {
    props.pageBreakBefore = true
    ctx.breakBefore = false
  }
  return props as Partial<IParagraphOptions>
}

function paragraph(node: JSONContent, ctx: Ctx, extra: Partial<IParagraphOptions>): ParagraphType {
  return new ctx.d.Paragraph({ ...paragraphProps(node, ctx, extra), children: inline(node.content ?? [], ctx) })
}

function inline(nodes: JSONContent[], ctx: Ctx): ParagraphChild[] {
  const { d } = ctx
  const out: ParagraphChild[] = []
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      out.push(new d.TextRun({ break: 1 }))
      continue
    }
    if (node.type !== 'text' || !node.text) continue
    const opts = runOptions(node.marks ?? [], ctx)
    // Tabs are their own element in Word.
    const runs = node.text.split('\t').flatMap((part, i) => [
      ...(i > 0 ? [new d.TextRun({ ...opts, children: [new d.Tab()] })] : []),
      ...(part ? [new d.TextRun({ ...opts, text: part })] : []),
    ])
    const link = node.marks?.find((mk) => mk.type === 'link')?.attrs?.href
    if (typeof link === 'string' && link) out.push(new d.ExternalHyperlink({ link, children: runs }))
    else out.push(...runs)
  }
  return out
}

function runOptions(marks: NonNullable<JSONContent['marks']>, ctx: Ctx): IRunOptions {
  const o: Record<string, unknown> = {}
  for (const mk of marks) {
    const a = mk.attrs ?? {}
    switch (mk.type) {
      case 'bold':
        o.bold = true
        break
      case 'italic':
        o.italics = true
        break
      case 'underline':
        o.underline = { type: ctx.d.UnderlineType.SINGLE }
        break
      case 'strike':
        o.strike = true
        break
      case 'superscript':
        o.superScript = true
        break
      case 'subscript':
        o.subScript = true
        break
      case 'link':
        o.style = 'Hyperlink'
        break
      case 'highlight': {
        const color = typeof a.color === 'string' ? a.color.toLowerCase() : '#ffff00'
        if (HIGHLIGHT[color]) o.highlight = HIGHLIGHT[color]
        else if (/^#[0-9a-f]{6}$/.test(color)) o.shading = { type: ctx.d.ShadingType.CLEAR, fill: color.slice(1), color: 'auto' }
        break
      }
      case 'textStyle': {
        if (typeof a.fontFamily === 'string' && a.fontFamily) o.font = wordFont(a.fontFamily)
        const size = halfPoints(a.fontSize)
        if (size) o.size = size
        if (typeof a.color === 'string' && /^#[0-9a-f]{6}$/i.test(a.color)) o.color = a.color.slice(1).toUpperCase()
        break
      }
    }
  }
  return o as IRunOptions
}

async function table(node: JSONContent, ctx: Ctx): Promise<TableType> {
  const { d } = ctx
  const rows = node.content ?? []
  const first = rows[0]?.content ?? []
  // Column widths: the first row's cell widths where the student set them, otherwise equal.
  const colWidthsPx: (number | null)[] = []
  for (const cell of first) {
    const span = Number(cell.attrs?.colspan) || 1
    const widths = Array.isArray(cell.attrs?.colwidth) ? (cell.attrs.colwidth as number[]) : []
    for (let i = 0; i < span; i++) colWidthsPx.push(widths[i] ?? null)
  }
  const cols = Math.max(1, colWidthsPx.length)
  const known = colWidthsPx.filter((w): w is number => typeof w === 'number')
  const knownTwips = known.reduce((s, w) => s + pxToTwips(w), 0)
  const unknownCount = cols - known.length
  const scale = unknownCount === 0 && knownTwips > 0 ? ctx.width / knownTwips : 1
  const rest = unknownCount > 0 ? Math.max(0, ctx.width - knownTwips) / unknownCount : 0
  const columnWidths = colWidthsPx.map((w) => Math.round(w == null ? rest : pxToTwips(w) * scale))
  const border = { style: d.BorderStyle.SINGLE, size: 4, color: '000000' }

  const tableRows = []
  for (const row of rows) {
    const cells = row.content ?? []
    const isHeader = cells.length > 0 && cells.every((c) => c.type === 'tableHeader')
    const tableCells = []
    let col = 0
    for (const cell of cells) {
      const colspan = Number(cell.attrs?.colspan) || 1
      const rowspan = Number(cell.attrs?.rowspan) || 1
      const cellWidth = columnWidths.slice(col, col + colspan).reduce((s, w) => s + w, 0)
      col += colspan
      const header = cell.type === 'tableHeader'
      const prevHeader = ctx.header
      ctx.header = header
      const savedWidth = ctx.width
      ctx.width = cellWidth
      const content = await blocks(cell.content ?? [], ctx)
      ctx.width = savedWidth
      ctx.header = prevHeader
      tableCells.push(
        new d.TableCell({
          children: content.length ? content : [new d.Paragraph({})],
          columnSpan: colspan > 1 ? colspan : undefined,
          rowSpan: rowspan > 1 ? rowspan : undefined,
          width: { size: cellWidth, type: d.WidthType.DXA },
          margins: { top: 60, bottom: 60, left: 100, right: 100 }, // 3pt 5pt, as on screen
          ...(header ? { shading: { type: d.ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } } : {}),
        }),
      )
    }
    // tableHeader marks the row as repeating header (and as a header row for importers).
    tableRows.push(new d.TableRow({ children: tableCells, ...(isHeader ? { tableHeader: true } : {}), cantSplit: true }))
  }
  return new d.Table({
    rows: tableRows,
    width: { size: ctx.width, type: d.WidthType.DXA },
    columnWidths,
    layout: d.TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
  })
}

// ---- images -----------------------------------------------------------------------------

type WordImage = { type: 'png' | 'jpg' | 'gif' | 'bmp'; data: Uint8Array; width: number; height: number }

/** Decode a data URL to bytes Word can embed. WebP and SVG are redrawn as PNG. */
export async function wordImage(src: string): Promise<WordImage | null> {
  const m = src.match(/^data:image\/(png|jpe?g|gif|bmp|webp|svg\+xml);base64,(.*)$/i)
  if (!m) return null
  const kind = m[1].toLowerCase()
  const size = await naturalSize(src)
  if (kind === 'webp' || kind === 'svg+xml') {
    const png = await redrawAsPng(src, size)
    return png && { type: 'png', data: png, ...size }
  }
  const type = kind === 'jpeg' || kind === 'jpg' ? 'jpg' : (kind as 'png' | 'gif' | 'bmp')
  return { type, data: base64Bytes(m[2]), ...size }
}

function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image did not load'))
    img.src = src
  })
}

async function naturalSize(src: string) {
  try {
    const img = await loadImage(src)
    return { width: img.naturalWidth || 300, height: img.naturalHeight || 200 }
  } catch {
    return { width: 300, height: 200 }
  }
}

async function redrawAsPng(src: string, size: { width: number; height: number }): Promise<Uint8Array | null> {
  try {
    const img = await loadImage(src)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    canvas.getContext('2d')?.drawImage(img, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}

async function image(node: JSONContent, ctx: Ctx): Promise<ParagraphType> {
  const { d } = ctx
  const a = node.attrs ?? {}
  const props = paragraphProps({ attrs: { textAlign: a.align ?? 'center' } }, ctx, {})
  const img = typeof a.src === 'string' ? await wordImage(a.src) : null
  if (!img) return new d.Paragraph(props) // unreadable image: keep the spot, lose nothing else
  // Shown size: as resized in the editor, never wider than the space between the margins.
  let width = typeof a.width === 'number' ? a.width : img.width
  let height = typeof a.height === 'number' ? a.height : (img.height * width) / img.width
  const maxPx = (ctx.width * 96) / TWIPS_PER_INCH
  if (width > maxPx) {
    height = (height * maxPx) / width
    width = maxPx
  }
  const alt = typeof a.alt === 'string' ? a.alt : ''
  return new d.Paragraph({
    ...props,
    children: [
      new d.ImageRun({
        type: img.type,
        data: img.data,
        transformation: { width: Math.round(width), height: Math.round(height) },
        altText: { name: alt || 'Image', description: alt, title: alt },
      }),
    ],
  })
}
