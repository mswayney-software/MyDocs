import { canonicalFont } from '@mysuite/core/fonts'
import type { Align, PageNumberPosition, PaperSize } from './native'

/**
 * Reads the parts of a .docx that mammoth (the HTML converter) leaves out: page size and
 * margins, the header and footer with their page numbers, and paragraph layout (alignment,
 * indents, line spacing), including what paragraphs inherit from their styles.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'

const xml = (text: string) => new DOMParser().parseFromString(text, 'application/xml')
/** Direct child elements in the Word namespace. */
const kids = (el: Element | null | undefined, name: string) =>
  el ? Array.from(el.children).filter((c) => c.namespaceURI === W && c.localName === name) : []
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0]
const val = (el: Element | null | undefined, name = 'val') => el?.getAttributeNS(W, name) ?? null
const num = (v: string | null) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places
/** w:val="0" and "false" turn a property off; a bare element turns it on. */
const on = (el: Element | undefined) => !!el && !['0', 'false', 'off'].includes(val(el) ?? '')

// ---- paragraphs ---------------------------------------------------------------------------

/** Paragraph layout in the editor's units: inches for indents, points for spacing. */
export interface ParaLayout {
  align?: Align | 'justify'
  indent?: number
  firstLine?: number
  lineHeight?: number
  spaceBefore?: number
  spaceAfter?: number
  pageBreakBefore?: boolean
  /** A title or heading: the editor's own heading styles apply, so only alignment is kept. */
  heading?: boolean
  /** Which Word list the paragraph belongs to (its numbering id), to keep separate lists apart. */
  list?: string
  /** Font and size (points) from the paragraph's style, where the file sets them. */
  font?: string
  size?: number
}

interface RawPPr {
  jc?: string
  ind?: { start?: number; firstLine?: number; hanging?: number }
  spacing?: { line?: number; lineRule?: string; before?: number; after?: number }
  pageBreakBefore?: boolean
}

function readPPr(pPr: Element | undefined): RawPPr {
  if (!pPr) return {}
  const out: RawPPr = {}
  const jc = val(kid(pPr, 'jc'))
  if (jc) out.jc = jc
  const ind = kid(pPr, 'ind')
  if (ind) {
    out.ind = {
      start: num(val(ind, 'start')) ?? num(val(ind, 'left')),
      firstLine: num(val(ind, 'firstLine')),
      hanging: num(val(ind, 'hanging')),
    }
  }
  const sp = kid(pPr, 'spacing')
  if (sp) {
    out.spacing = {
      line: num(val(sp, 'line')),
      lineRule: val(sp, 'lineRule') ?? undefined,
      before: num(val(sp, 'before')),
      after: num(val(sp, 'after')),
    }
  }
  if (kid(pPr, 'pageBreakBefore')) out.pageBreakBefore = on(kid(pPr, 'pageBreakBefore'))
  return out
}

/** Later layers override earlier ones, property by property. */
function merge(...layers: RawPPr[]): RawPPr {
  const out: RawPPr = {}
  for (const l of layers) {
    if (l.jc) out.jc = l.jc
    if (l.ind) {
      // First-line and hanging indents exclude each other: the later layer's one wins.
      const base = { ...out.ind }
      if (l.ind.hanging !== undefined) delete base.firstLine
      if (l.ind.firstLine !== undefined) delete base.hanging
      out.ind = { ...base, ...defined(l.ind) }
    }
    if (l.spacing) out.spacing = { ...out.spacing, ...defined(l.spacing) }
    if (l.pageBreakBefore !== undefined) out.pageBreakBefore = l.pageBreakBefore
  }
  return out
}
const defined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>

interface Style {
  id: string
  name: string
  basedOn?: string
  pPr: RawPPr
  font?: string
  size?: number
}

export interface DocxStyles {
  styles: Map<string, Style>
  defaults: RawPPr
  /** The paragraph style used when a paragraph names none ("Normal"). */
  defaultStyle?: string
  font?: string
  size?: number
  /** Document defaults, before any style. */
  baseFont?: string
  baseSize?: number
}

export function readStyles(stylesXml: string | null, themeXml: string | null): DocxStyles {
  const out: DocxStyles = { styles: new Map(), defaults: {} }
  if (!stylesXml) return out
  const doc = xml(stylesXml)
  const theme = themeFonts(themeXml)
  const fontOf = (rPr: Element | undefined) => {
    const f = kid(rPr, 'rFonts')
    if (!f) return undefined
    const direct = val(f, 'ascii') ?? val(f, 'hAnsi')
    if (direct) return direct
    const t = val(f, 'asciiTheme') ?? val(f, 'hAnsiTheme')
    return t?.startsWith('major') ? theme.major : t?.startsWith('minor') ? theme.minor : undefined
  }
  const sizeOf = (rPr: Element | undefined) => {
    const sz = num(val(kid(rPr, 'sz')))
    return sz ? sz / 2 : undefined
  }
  const root = doc.documentElement
  const docDefaults = kid(root, 'docDefaults')
  out.defaults = readPPr(kid(kid(docDefaults, 'pPrDefault'), 'pPr'))
  const rPrDefault = kid(kid(docDefaults, 'rPrDefault'), 'rPr')
  out.font = out.baseFont = fontOf(rPrDefault)
  out.size = out.baseSize = sizeOf(rPrDefault)
  for (const s of kids(root, 'style')) {
    if (val(s, 'type') !== 'paragraph') continue
    const id = val(s, 'styleId') ?? ''
    const style: Style = {
      id,
      name: (val(kid(s, 'name')) ?? id).toLowerCase(),
      basedOn: val(kid(s, 'basedOn')) ?? undefined,
      pPr: readPPr(kid(s, 'pPr')),
      font: fontOf(kid(s, 'rPr')),
      size: sizeOf(kid(s, 'rPr')),
    }
    out.styles.set(id, style)
    if (val(s, 'default') === '1' || val(s, 'default') === 'true') out.defaultStyle = id
  }
  // The body font is the default style's font, falling back to the document defaults.
  const chain = styleChain(out, out.defaultStyle)
  for (const st of chain) {
    out.font = st.font ?? out.font
    out.size = st.size ?? out.size
  }
  return out
}

function themeFonts(themeXml: string | null): { major?: string; minor?: string } {
  if (!themeXml) return {}
  const doc = xml(themeXml)
  const pick = (name: string) => {
    const el = doc.getElementsByTagNameNS(A, name)[0]
    return el?.getElementsByTagNameNS(A, 'latin')[0]?.getAttribute('typeface') || undefined
  }
  return { major: pick('majorFont'), minor: pick('minorFont') }
}

/** A style and the styles it is based on, base first. */
function styleChain(styles: DocxStyles, id: string | undefined): Style[] {
  const chain: Style[] = []
  const seen = new Set<string>()
  let cur = id
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const st = styles.styles.get(cur)
    if (!st) break
    chain.unshift(st)
    cur = st.basedOn
  }
  return chain
}

const isHeadingStyle = (chain: Style[]) => chain.some((s) => /^(heading [1-9]|title)$/.test(s.name))

/**
 * Every body paragraph's layout, in document order (the order mammoth visits them).
 * Paragraphs inside text boxes are left out; mammoth moves those elsewhere.
 */
export function readParagraphs(documentXml: string, styles: DocxStyles): ParaLayout[] {
  const doc = xml(documentXml)
  const all = Array.from(doc.getElementsByTagNameNS(W, 'p')).filter((p) => !insideTextBox(p))
  return all.map((p) => {
    const pPr = kid(p, 'pPr')
    const chain = styleChain(styles, val(kid(pPr, 'pStyle')) ?? styles.defaultStyle)
    const raw = merge(styles.defaults, ...chain.map((s) => s.pPr), readPPr(pPr))
    const heading = isHeadingStyle(chain)
    const layout: ParaLayout = {}
    let font = styles.baseFont
    let size = styles.baseSize
    for (const st of chain) {
      font = st.font ?? font
      size = st.size ?? size
    }
    const numId = val(kid(kid(pPr, 'numPr'), 'numId'))
    if (numId && numId !== '0') layout.list = numId
    if (font) layout.font = canonicalFont(font)
    if (size) layout.size = size
    const align = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[raw.jc ?? ''] as ParaLayout['align']
    if (align && align !== 'left') layout.align = align
    if (heading) return { ...layout, heading: true, ...(raw.pageBreakBefore ? { pageBreakBefore: true } : {}) }
    // A quote's indent comes from being a quote.
    if (chain.some((s) => s.name === 'quote' || s.name === 'intense quote')) return layout
    const ind = raw.ind ?? {}
    if (ind.start) layout.indent = round(ind.start / 1440)
    if (ind.firstLine) layout.firstLine = round(ind.firstLine / 1440)
    else if (ind.hanging) layout.firstLine = -round(ind.hanging / 1440)
    const sp = raw.spacing ?? {}
    // Values equal to the editor's own defaults (1.15 lines, no space) are left unset.
    if (sp.line && (sp.lineRule ?? 'auto') === 'auto' && sp.line !== 276) layout.lineHeight = round(sp.line / 240)
    if (sp.before) layout.spaceBefore = round(sp.before / 20, 1)
    if (sp.after) layout.spaceAfter = round(sp.after / 20, 1)
    if (raw.pageBreakBefore) layout.pageBreakBefore = true
    return layout
  })
}

function insideTextBox(el: Element) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.namespaceURI === W && p.localName === 'txbxContent') return true
  }
  return false
}

/** Shown size of each picture, in CSS pixels, in document order. */
export function readImageSizes(documentXml: string): { width: number; height: number }[] {
  const doc = xml(documentXml)
  const sizes: { width: number; height: number }[] = []
  for (const el of Array.from(doc.getElementsByTagNameNS(WP, '*'))) {
    if (el.localName !== 'inline' && el.localName !== 'anchor') continue
    if (!el.getElementsByTagNameNS(A, 'blip').length) continue
    const ext = Array.from(el.children).find((c) => c.localName === 'extent')
    const cx = Number(ext?.getAttribute('cx'))
    const cy = Number(ext?.getAttribute('cy'))
    if (cx > 0 && cy > 0) sizes.push({ width: Math.round(cx / 9525), height: Math.round(cy / 9525) })
  }
  return sizes
}

// ---- page setup -----------------------------------------------------------------------------

export interface SectionInfo {
  paperSize: PaperSize
  margins: { top: number; right: number; bottom: number; left: number }
  headerRel?: string
  footerRel?: string
}

/** The document's (last) section: paper, margins, and which header and footer it uses. */
export function readSection(documentXml: string): SectionInfo {
  const doc = xml(documentXml)
  const body = doc.getElementsByTagNameNS(W, 'body')[0]
  const sect = kid(body, 'sectPr') ?? Array.from(doc.getElementsByTagNameNS(W, 'sectPr')).at(-1)
  const pgSz = kid(sect, 'pgSz')
  const w = num(val(pgSz, 'w')) ?? 12240
  const paperSize: PaperSize = Math.abs(w - 11906) < Math.abs(w - 12240) ? 'a4' : 'letter'
  const pgMar = kid(sect, 'pgMar')
  const inch = (name: string) => round((num(val(pgMar, name)) ?? 1440) / 1440)
  const ref = (kind: 'headerReference' | 'footerReference') => {
    const refs = kids(sect, kind)
    const pick = refs.find((r) => val(r, 'type') === 'default') ?? refs.find((r) => val(r, 'type') !== 'first' && val(r, 'type') !== 'even')
    return pick?.getAttributeNS(R, 'id') ?? undefined
  }
  return {
    paperSize,
    margins: { top: inch('top'), right: inch('right'), bottom: inch('bottom'), left: inch('left') },
    headerRel: ref('headerReference'),
    footerRel: ref('footerReference'),
  }
}

/** Relationship id -> part path inside the zip ("rId8" -> "word/header1.xml"). */
export function readRels(relsXml: string | null): Map<string, string> {
  const map = new Map<string, string>()
  if (!relsXml) return map
  for (const r of Array.from(xml(relsXml).getElementsByTagName('Relationship'))) {
    const id = r.getAttribute('Id')
    const target = r.getAttribute('Target')
    if (id && target) map.set(id, target.startsWith('/') ? target.slice(1) : `word/${target}`)
  }
  return map
}

export interface MarginInfo {
  text: string
  align: Align
  /** Where the page number is, and the text just before it ("Smith"). */
  pageNumber?: { prefix: string; align: Align }
}

/** A header or footer part, read as one line of left, center and right text. */
export function readMargin(partXml: string): MarginInfo | null {
  const doc = xml(partXml)
  const paras = Array.from(doc.getElementsByTagNameNS(W, 'p'))
  for (const p of paras) {
    // Cells split by tabs; each holds text and, maybe, the page number.
    const cells: { text: string; page: boolean; prefix: string }[] = [{ text: '', page: false, prefix: '' }]
    let inField = 0
    let fieldIsPage = false
    let showingResult = false
    const walk = (el: Element) => {
      for (const c of Array.from(el.children)) {
        if (c.namespaceURI !== W) continue
        const cell = cells[cells.length - 1]
        switch (c.localName) {
          case 'fldSimple':
            if (/\bPAGE\b/.test(c.getAttributeNS(W, 'instr') ?? '')) {
              cell.page = true
              cell.prefix = cell.text
            } else walk(c)
            break
          case 'fldChar': {
            const type = val(c, 'fldCharType')
            if (type === 'begin') {
              inField++
              fieldIsPage = false
              showingResult = false
            } else if (type === 'separate') showingResult = true
            else if (type === 'end') {
              inField = Math.max(0, inField - 1)
              showingResult = false
            }
            break
          }
          case 'instrText':
            if (/\bPAGE\b/.test(c.textContent ?? '') && !fieldIsPage) {
              fieldIsPage = true
              cell.page = true
              cell.prefix = cell.text
            }
            break
          case 't':
            // The page number's cached value ("1") is not text the student typed.
            if (!(inField && (fieldIsPage || !showingResult))) cell.text += c.textContent ?? ''
            break
          case 'tab':
            if (c.parentElement?.localName === 'r') cells.push({ text: '', page: false, prefix: '' })
            break
          case 'pPr':
            break
          default:
            walk(c)
        }
      }
    }
    walk(p)
    if (!cells.some((c) => c.text.trim() || c.page)) continue
    const jc = val(kid(kid(p, 'pPr'), 'jc'))
    const paraAlign: Align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : 'left'
    // Word's default header tabs: one tab = center, two = right.
    const alignOf = (i: number): Align => (cells.length === 1 ? paraAlign : (['left', 'center', 'right'] as const)[Math.min(i, 2)])
    const info: MarginInfo = { text: '', align: paraAlign }
    const texts: string[] = []
    cells.forEach((c, i) => {
      if (c.page) {
        info.pageNumber = { prefix: c.prefix.trim(), align: alignOf(i) }
        const after = c.text.slice(c.prefix.length).trim()
        if (after) texts.push(after)
      } else if (c.text.trim()) {
        texts.push(c.text.trim())
        info.align = alignOf(i)
      }
    })
    info.text = texts.join(' ')
    return info
  }
  return null
}

/** Our page number positions, from where Word had it. */
export function pageNumberPosition(edge: 'top' | 'bottom', align: Align): PageNumberPosition {
  if (edge === 'top') return 'header-right'
  return align === 'right' ? 'footer-right' : 'footer-center'
}

export const bodyFont = (s: DocxStyles) => (s.font ? canonicalFont(s.font) : undefined)

// ---- runs -----------------------------------------------------------------------------------

/** Character formatting set directly on a run (what mammoth leaves out). */
export interface RunLook {
  font?: string
  /** Points. */
  size?: number
  /** "#rrggbb". */
  color?: string
  highlight?: string
}

/** Word's named highlight colors. The first five match the editor's highlight swatches. */
const HIGHLIGHT_HEX: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', lightGray: '#d3d3d3',
  blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000',
  darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', black: '#000000', white: '#ffffff',
}

/**
 * Every run's direct formatting, in document order (the order mammoth visits runs).
 * Deleted text and text boxes are left out, as mammoth leaves them out.
 */
export function readRuns(documentXml: string, themeXml: string | null): RunLook[] {
  const doc = xml(documentXml)
  const theme = themeFonts(themeXml)
  return Array.from(doc.getElementsByTagNameNS(W, 'r'))
    .filter((r) => !insideTextBox(r) && !insideDeleted(r))
    .map((r) => {
      const rPr = kid(r, 'rPr')
      const look: RunLook = {}
      if (!rPr) return look
      const f = kid(rPr, 'rFonts')
      const t = f && (val(f, 'asciiTheme') ?? val(f, 'hAnsiTheme'))
      const font = (f && (val(f, 'ascii') ?? val(f, 'hAnsi'))) ?? (t?.startsWith('major') ? theme.major : t?.startsWith('minor') ? theme.minor : undefined)
      if (font) look.font = canonicalFont(font)
      const sz = num(val(kid(rPr, 'sz')))
      if (sz) look.size = sz / 2
      const color = val(kid(rPr, 'color'))
      if (color && /^[0-9a-f]{6}$/i.test(color)) look.color = `#${color.toLowerCase()}`
      const hl = val(kid(rPr, 'highlight'))
      if (hl && HIGHLIGHT_HEX[hl]) look.highlight = HIGHLIGHT_HEX[hl]
      else {
        const fill = kid(rPr, 'shd')?.getAttributeNS(W, 'fill')
        if (fill && /^[0-9a-f]{6}$/i.test(fill) && fill.toLowerCase() !== 'ffffff') look.highlight = `#${fill.toLowerCase()}`
      }
      return look
    })
}

function insideDeleted(el: Element) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.namespaceURI === W && (p.localName === 'del' || p.localName === 'moveFrom')) return true
  }
  return false
}
