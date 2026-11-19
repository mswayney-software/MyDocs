import type { Deck } from '../deck/schema'

const FONT_IN_TEXT = /"fontFamily":"([^"]+)"/g
const FACES = ['400 normal', '700 normal', '400 italic', '700 italic']

/**
 * Load every font the deck uses, in plain, bold and italic, as a presentation starts. A browser
 * otherwise fetches a font the first time a slide needs it: the text would show in a stand-in
 * font, then jump, in front of the audience. Offline the files come from the app's cache.
 */
export function loadDeckFonts(deck: Deck) {
  if (typeof document === 'undefined' || !document.fonts?.load) return
  const families = new Set([deck.theme.fonts.heading, deck.theme.fonts.body])
  for (const m of JSON.stringify(deck.slides).matchAll(FONT_IN_TEXT)) families.add(m[1].split(',')[0].trim().replace(/^['"]|['"]$/g, ''))
  for (const family of families) {
    for (const face of FACES) {
      const [weight, style] = face.split(' ')
      document.fonts.load(`${style} ${weight} 32px "${family}"`).catch(() => {})
    }
  }
}
