import { createPortal } from 'react-dom'
import type { Media } from '../deck/media'
import type { Deck } from '../deck/schema'
import { SlideView } from '../slide/SlideView'

/**
 * Every slide, one per page, in static mode: what prints. Hidden on screen. The pages sit outside
 * the app (a portal on the body) so printing shows them and nothing else.
 */
export function PrintDeck({ deck, media }: { deck: Deck; media: Media }) {
  const { width, height } = deck.size
  return createPortal(
    <div className="print-deck" aria-hidden="true">
      {deck.slides.map((slide, i) => (
        <section key={slide.id} className="print-page" data-page={i + 1}>
          <div className="print-scale" style={{ width, height }}>
            <SlideView slide={slide} theme={deck.theme} media={media} />
          </div>
        </section>
      ))}
    </div>,
    document.body,
  )
}
