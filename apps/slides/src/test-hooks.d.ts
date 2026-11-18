import type { DeckSession } from './deck/session'

declare global {
  interface Window {
    /** Test hook, only present in builds made with `--mode e2e`. */
    __mySlides?: DeckSession
  }
}
