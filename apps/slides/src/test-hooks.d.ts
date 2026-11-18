import type { CanvasController } from './canvas/controller'
import type { DeckSession } from './deck/session'

declare global {
  interface Window {
    /** Test hooks, only present in builds made with `--mode e2e`. */
    __mySlides?: DeckSession
    __mySlidesCanvas?: CanvasController
  }
}
