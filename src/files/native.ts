import type { JSONContent } from '@tiptap/core'
import { Node as PMNode, type Schema } from '@tiptap/pm/model'
import { canonicalFont } from '../editor/fonts'
import { isEmbeddedImage } from '../editor/image'

/**
 * Native file format: one JSON file holding a format version, page settings, and the
 * editor's document JSON (images, from M4 on, are embedded as data URLs).
 * The extension is tied to the product name, which is still a placeholder.
 */
export const FORMAT_ID = 'open-writer'
export const FORMAT_VERSION = 1
export const FILE_EXTENSION = '.owdoc'
export const FILE_MIME = 'application/vnd.open-writer+json'
export const FILE_DESCRIPTION = 'Open Writer document'

export type PaperSize = 'letter' | 'a4'

/** Page settings. Defined now so the v1 format is stable; the UI for them arrives in M5. */
export interface PageSettings {
  paperSize: PaperSize
  /** Inches. */
  margins: { top: number; right: number; bottom: number; left: number }
  header: string
  footer: string
  pageNumbers: 'none' | 'header-right' | 'footer-center'
  [key: string]: unknown
}

export const DEFAULT_PAGE: PageSettings = {
  paperSize: 'letter',
  margins: { top: 1, right: 1, bottom: 1, left: 1 },
  header: '',
  footer: '',
  pageNumbers: 'none',
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
    throw new OpenError('not-ours', "This file isn't an Open Writer document, or it is damaged.")
  }
  if (!isRecord(data) || data.format !== FORMAT_ID) {
    throw new OpenError('not-ours', "This file isn't an Open Writer document.")
  }
  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
    throw new OpenError('damaged', 'This document is damaged and could not be opened.')
  }
  if (data.version > FORMAT_VERSION) {
    throw new OpenError(
      'newer-version',
      'This document was made with a newer version of Open Writer. Update the app to open it.',
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
function readPage(raw: unknown): PageSettings {
  if (!isRecord(raw)) return structuredClone(DEFAULT_PAGE)
  const margins = isRecord(raw.margins) ? raw.margins : {}
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    ...raw,
    paperSize: raw.paperSize === 'a4' ? 'a4' : 'letter',
    margins: {
      top: num(margins.top, 1),
      right: num(margins.right, 1),
      bottom: num(margins.bottom, 1),
      left: num(margins.left, 1),
    },
    header: typeof raw.header === 'string' ? raw.header : '',
    footer: typeof raw.footer === 'string' ? raw.footer : '',
    pageNumbers:
      raw.pageNumbers === 'header-right' || raw.pageNumbers === 'footer-center' ? raw.pageNumbers : 'none',
  }
}

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
