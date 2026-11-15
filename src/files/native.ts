import type { JSONContent } from '@tiptap/core'
import { Node as PMNode, type Schema } from '@tiptap/pm/model'
import { canonicalFont } from '../editor/fonts'
import { isEmbeddedImage } from '../editor/image'

/**
 * Native file format: one JSON file holding a format version, page settings, and the
 * editor's document JSON (images, from M4 on, are embedded as data URLs).
 * The extension is tied to the product name, which is still a placeholder.
 */
export const FORMAT_ID = 'mydocs'
/** Files saved before the app was named MyDocs (working title "Open Writer"). */
export const LEGACY_FORMAT_IDS = ['open-writer']
export const FORMAT_VERSION = 1
export const FILE_EXTENSION = '.owdoc'
export const FILE_MIME = 'application/vnd.mydocs+json'
export const FILE_DESCRIPTION = 'MyDocs document'

export type PaperSize = 'letter' | 'a4'
export type Align = 'left' | 'center' | 'right'
export type PageNumberPosition = 'none' | 'header-right' | 'footer-center' | 'footer-right'

/** Page settings, applied when the document is printed, saved as PDF, or exported. */
export interface PageSettings {
  paperSize: PaperSize
  /** Inches. */
  margins: { top: number; right: number; bottom: number; left: number }
  /** Text printed at the top of every page. */
  header: string
  headerAlign: Align
  /** Text printed at the bottom of every page. */
  footer: string
  footerAlign: Align
  pageNumbers: PageNumberPosition
  /** Printed before the page number, such as the student's last name for MLA ("Smith 3"). */
  pageNumberPrefix: string
  [key: string]: unknown
}

export const MIN_MARGIN = 0.25
export const MAX_MARGIN = 3

export const DEFAULT_PAGE: PageSettings = {
  paperSize: 'letter',
  margins: { top: 1, right: 1, bottom: 1, left: 1 },
  header: '',
  headerAlign: 'left',
  footer: '',
  footerAlign: 'center',
  pageNumbers: 'none',
  pageNumberPrefix: '',
}

export interface NativeDocument {
  page: PageSettings
  doc: JSONContent
}

export type OpenErrorKind = 'not-ours' | 'newer-version' | 'damaged'

/** A file that can't be opened, with a message written for the student. */
export class OpenError extends Error {
  readonly kind: OpenErrorKind
  constructor(kind: OpenErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export function serialize({ page, doc }: NativeDocument): string {
  return JSON.stringify({ format: FORMAT_ID, version: FORMAT_VERSION, page, doc })
}

/** Parse and validate a native file. Throws OpenError; never returns a half-read document. */
export function parse(text: string, schema: Schema): NativeDocument {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new OpenError('not-ours', "This file isn't a MyDocs document, or it is damaged.")
  }
  if (!isRecord(data) || (data.format !== FORMAT_ID && !LEGACY_FORMAT_IDS.includes(data.format as string))) {
    throw new OpenError('not-ours', "This file isn't a MyDocs document.")
  }
  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
    throw new OpenError('damaged', 'This document is damaged and could not be opened.')
  }
  if (data.version > FORMAT_VERSION) {
    throw new OpenError(
      'newer-version',
      'This document was made with a newer version of MyDocs. Update the app to open it.',
    )
  }
  if (!isRecord(data.doc)) {
    throw new OpenError('damaged', 'This document is damaged and could not be opened.')
  }
  try {
    // Reject anything the editor can't represent instead of silently dropping it.
    PMNode.fromJSON(schema, data.doc).check()
  } catch {
    throw new OpenError('damaged', 'This document is damaged and could not be opened.')
  }
  return { page: readPage(data.page), doc: migrate(data.doc as JSONContent) }
}

/**
 * Clean a document as it is read:
 * - font names from before the fonts were bundled ("Liberation Serif") map to the bundled ones;
 * - images that point at a web address are dropped. The app never loads anything from the
 *   network, and a hand-made file with such an image could otherwise report who opened it.
 */
function migrate(node: JSONContent): JSONContent {
  const marks = node.marks?.map((m) =>
    m.type === 'textStyle' && typeof m.attrs?.fontFamily === 'string'
      ? { ...m, attrs: { ...m.attrs, fontFamily: canonicalFont(m.attrs.fontFamily) } }
      : m,
  )
  return {
    ...node,
    ...(marks && { marks }),
    ...(node.content && {
      content: node.content.filter((c) => c.type !== 'image' || isEmbeddedImage(c.attrs?.src)).map(migrate),
    }),
  }
}

/** Fill in defaults, keep unknown keys so a round trip never drops data. */
export function readPage(raw: unknown): PageSettings {
  if (!isRecord(raw)) return structuredClone(DEFAULT_PAGE)
  const margins = isRecord(raw.margins) ? raw.margins : {}
  const margin = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, v)) : 1
  const text = (v: unknown) => (typeof v === 'string' ? oneLine(v) : '')
  const align = (v: unknown, d: Align): Align => (v === 'left' || v === 'center' || v === 'right' ? v : d)
  const numbers: PageNumberPosition[] = ['header-right', 'footer-center', 'footer-right']
  return {
    ...raw,
    paperSize: raw.paperSize === 'a4' ? 'a4' : 'letter',
    margins: {
      top: margin(margins.top),
      right: margin(margins.right),
      bottom: margin(margins.bottom),
      left: margin(margins.left),
    },
    header: text(raw.header),
    headerAlign: align(raw.headerAlign, 'left'),
    footer: text(raw.footer),
    footerAlign: align(raw.footerAlign, 'center'),
    pageNumbers: numbers.find((n) => n === raw.pageNumbers) ?? 'none',
    pageNumberPrefix: text(raw.pageNumberPrefix),
  }
}

/** Headers and footers are a single line. */
export const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').slice(0, 200)

/** "Essay.owdoc" -> "Essay". */
export function baseName(fileName: string): string {
  return fileName.toLowerCase().endsWith(FILE_EXTENSION) ? fileName.slice(0, -FILE_EXTENSION.length) : fileName
}

/** Strip characters Windows, macOS and ChromeOS refuse in file names. */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what must go
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().replace(/\.+$/, '')
  return cleaned || 'Untitled document'
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
