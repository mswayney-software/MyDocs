import { FORMAT_ID, FORMAT_VERSION, SLIDE_HEIGHT, SLIDE_WIDTH, type Deck, type Slide, type Theme } from './schema'

export const APP_NAME = 'MySlides'
export const APP_VERSION = '0.1.0'

/** Ids carry no meaning; they only need to be unique within a deck. */
export const newId = (prefix: string) => `${prefix}${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`

/**
 * The one theme until Phase 3 adds the six real ones. Fonts are the bundled ones, so a deck
 * looks the same on every computer.
 */
export const STARTER_THEME: Theme = {
  id: 'plain',
  colors: {
    background: '#FFFFFF',
    text: '#1F2933',
    heading: '#0B3C5D',
    accent1: '#1F7A8C',
    accent2: '#E07A5F',
    accent3: '#81B29A',
    accent4: '#F2CC8F',
    accent5: '#3D405B',
    accent6: '#9A8C98',
  },
  fonts: { heading: 'Carlito', body: 'Arimo' },
}

const emptyText = () => ({ type: 'doc' as const, content: [{ type: 'paragraph' as const }] })

/** A title slide with its two placeholders, as a new deck opens. */
export function titleSlide(): Slide {
  return {
    id: newId('s'),
    layout: 'title',
    background: null,
    transition: 'none',
    notes: '',
    elements: [
      { id: newId('e'), type: 'text', role: 'title', x: 120, y: 220, w: 1040, h: 160, verticalAlign: 'bottom', content: emptyText() },
      { id: newId('e'), type: 'text', role: 'subtitle', x: 120, y: 400, w: 1040, h: 100, verticalAlign: 'top', content: emptyText() },
    ],
  }
}

/** Title and content: what New slide adds until Phase 3 brings the layout picker. */
export function contentSlide(): Slide {
  return {
    id: newId('s'),
    layout: 'title-content',
    background: null,
    transition: 'none',
    notes: '',
    elements: [
      { id: newId('e'), type: 'text', role: 'title', x: 80, y: 40, w: 1120, h: 110, verticalAlign: 'bottom', content: emptyText() },
      { id: newId('e'), type: 'text', role: 'body', x: 80, y: 180, w: 1120, h: 480, verticalAlign: 'top', content: emptyText() },
    ],
  }
}

/** A free text box the student adds, centered on the slide. */
export function textBox(): Extract<Slide['elements'][number], { type: 'text' }> {
  return { id: newId('e'), type: 'text', x: 340, y: 310, w: 600, h: 100, verticalAlign: 'top', content: emptyText() }
}

export function newDeck(now = new Date()): Deck {
  const at = now.toISOString()
  return {
    format: FORMAT_ID,
    formatVersion: FORMAT_VERSION,
    app: { name: APP_NAME, version: APP_VERSION },
    meta: { title: '', created: at, modified: at },
    size: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
    theme: structuredClone(STARTER_THEME),
    slides: [titleSlide()],
  }
}
