import { slideWithLayout } from './layouts'
import { newId } from './newId'
import { FORMAT_ID, FORMAT_VERSION, SLIDE_HEIGHT, SLIDE_WIDTH, type Deck, type Slide, type Theme } from './schema'
import { themeForDeck } from './themes'

export { newId }

export const APP_NAME = 'MySlides'
export const APP_VERSION = '0.1.0'


/** A new deck's theme. Fonts are bundled, so a deck looks the same on every computer. */
export const STARTER_THEME: Theme = themeForDeck('plain')

const emptyText = () => ({ type: 'doc' as const, content: [{ type: 'paragraph' as const }] })

/** A title slide with its two placeholders, as a new deck opens. */
export const titleSlide = (): Slide => slideWithLayout('title')

/** Title and content: what New slide adds. */
export const contentSlide = (): Slide => slideWithLayout('title-content')

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
