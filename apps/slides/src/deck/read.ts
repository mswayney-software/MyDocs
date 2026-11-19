import { newId, STARTER_THEME } from './defaults'
import {
  color, deckSchema, element, FORMAT_ID, FORMAT_VERSION, slideSchema, themeSchema, TRANSITIONS,
  type BrokenElement, type Deck, type Element, type Slide,
} from './schema'

export type OpenErrorKind = 'not-ours' | 'newer-version' | 'damaged'

/** A deck that can't be opened, with a message written for the student. */
export class OpenError extends Error {
  readonly kind: OpenErrorKind
  constructor(kind: OpenErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export const DAMAGED = 'This deck is damaged and could not be opened.'

export interface ReadResult {
  deck: Deck
  /** Plain-words notes about parts that could not be read. Empty when the deck opened cleanly. */
  warnings: string[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const WHAT: Record<string, string> = {
  text: 'A text box',
  image: 'A picture',
  shape: 'A shape',
  table: 'A table',
  chart: 'A chart',
}

/**
 * Read deck.json. Throws OpenError for a file that is not a deck, is from a newer version, or
 * is damaged as a whole. A damaged element or slide setting does not stop the deck from
 * opening: elements become labeled placeholders, settings fall back to defaults, and the
 * warnings say so.
 *
 * `hasMedia` tells whether a picture's file is in the deck; a picture without one is broken.
 */
export function readDeckJson(text: string, hasMedia: (src: string) => boolean = () => true): ReadResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new OpenError('damaged', DAMAGED)
  }
  if (!isRecord(data) || data.format !== FORMAT_ID) {
    throw new OpenError('not-ours', "This file isn't a MySlides deck.")
  }
  const version = data.formatVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new OpenError('damaged', DAMAGED)
  }
  if (version > FORMAT_VERSION) {
    throw new OpenError('newer-version', 'This deck was made with a newer version of MySlides. Update the app to open it.')
  }

  const warnings: string[] = []
  let resetSettings = false

  const theme = themeSchema.safeParse(data.theme)
  if (!theme.success) warnings.push('The deck’s theme could not be read, so it uses the plain theme.')

  if (!Array.isArray(data.slides) || data.slides.length === 0) throw new OpenError('damaged', DAMAGED)
  const ids = new Set<string>()
  const uniqueId = (id: unknown, prefix: string) => {
    let out = typeof id === 'string' && id ? id : newId(prefix)
    while (ids.has(out)) out = newId(prefix) // ids carry no meaning; a duplicate just gets a new one
    ids.add(out)
    return out
  }

  let broken = 0
  const slides: Slide[] = data.slides.map((raw) => {
    if (!isRecord(raw)) throw new OpenError('damaged', DAMAGED)
    let parsed = slideSchema.safeParse(raw)
    if (!parsed.success) {
      // Keep the slide; put back defaults for the settings that are wrong.
      resetSettings = true
      parsed = slideSchema.safeParse({
        ...raw,
        id: typeof raw.id === 'string' && raw.id ? raw.id : newId('s'),
        layout: typeof raw.layout === 'string' ? raw.layout : 'blank',
        background: color.safeParse(raw.background).success ? raw.background : null,
        transition: TRANSITIONS.includes(raw.transition as never) ? raw.transition : 'none',
        notes: typeof raw.notes === 'string' ? raw.notes : '',
        elements: Array.isArray(raw.elements) ? raw.elements : [],
      })
      if (!parsed.success) throw new OpenError('damaged', DAMAGED)
    }
    const slide = parsed.data
    const elements: Element[] = slide.elements.map((rawEl) => {
      const el = readElement(rawEl, hasMedia)
      if (el.type === 'broken') broken++
      return { ...el, id: uniqueId(el.id, 'e') } as Element
    })
    return { ...slide, id: uniqueId(slide.id, 's'), elements }
  })

  if (broken === 1) warnings.push('One part of this deck could not be read. It shows as a gray box; everything else opened normally.')
  if (broken > 1) warnings.push(`${broken} parts of this deck could not be read. They show as gray boxes; everything else opened normally.`)
  if (resetSettings) warnings.push('Some slide settings could not be read and were reset.')

  const top = deckSchema.safeParse({ ...data, theme: theme.success ? theme.data : STARTER_THEME, slides: slides.map((s) => ({ ...s, elements: [] })) })
  if (!top.success) throw new OpenError('damaged', DAMAGED)
  return { deck: { ...top.data, slides } as Deck, warnings }
}

function readElement(raw: unknown, hasMedia: (src: string) => boolean): Element {
  const parsed = element.safeParse(raw)
  if (parsed.success) {
    const el = parsed.data
    if (el.type === 'image' && !hasMedia(el.src)) return broken(raw, 'This picture is missing from the file.')
    return el
  }
  const type = isRecord(raw) && typeof raw.type === 'string' ? raw.type : ''
  return broken(raw, `${WHAT[type] ?? 'This part of the slide'} could not be read.`)
}

/** A placeholder in the element's place, or a default spot if even its position is unreadable. */
function broken(raw: unknown, reason: string): BrokenElement {
  const r = isRecord(raw) ? raw : {}
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    type: 'broken',
    id: typeof r.id === 'string' ? r.id : '',
    x: num(r.x, 80),
    y: num(r.y, 80),
    w: Math.max(40, num(r.w, 320)),
    h: Math.max(40, num(r.h, 180)),
    reason,
    raw,
  }
}

/** The deck as file JSON: broken elements go back exactly as they were read. */
export function deckToJson(deck: Deck, pretty = false): string {
  const out = {
    ...deck,
    slides: deck.slides.map((s) => ({ ...s, elements: s.elements.map((e) => (e.type === 'broken' ? e.raw : e)) })),
  }
  return pretty ? JSON.stringify(out, null, 2) + '\n' : JSON.stringify(out)
}
