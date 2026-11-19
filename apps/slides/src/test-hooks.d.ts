import type { CanvasController } from './canvas/controller'
import type { DeckSession } from './deck/session'
import type { Presentation } from './present/presentation'

declare global {
  interface Window {
    /** Test hooks, only present in builds made with `--mode e2e`. */
    __mySlides?: DeckSession
    __mySlidesCanvas?: CanvasController
    __mySlidesPresent?: Presentation
    /** Set by browser tests that time Presenter view's two windows. */
    __seenAt?: Promise<number>
    __sentAt?: Promise<number>
  }
}
