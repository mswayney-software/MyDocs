import type { CanvasController } from '../canvas/controller'
import { SlideGrid } from '../sorter/SlideGrid'

/**
 * The slide strip beside the editor: a thumbnail per slide. Click to open; Up and Down move
 * between slides; Ctrl+Up and Ctrl+Down move the slide; Delete, Ctrl+D, and the Menu key
 * (or right-click) for everything else. Drag to reorder.
 */
export function SlideStrip({ controller }: { controller: CanvasController }) {
  return (
    <nav className="slide-strip" aria-label="Slides">
      <SlideGrid controller={controller} variant="strip" label="Slides" />
    </nav>
  )
}
