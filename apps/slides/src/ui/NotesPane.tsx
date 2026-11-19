import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import type { CanvasController } from '../canvas/controller'

/** Whether the pane is open is remembered on this device only. */
const OPEN_KEY = 'myslides:notes-open'

function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Speaker notes for the current slide, under the canvas: plain text, saved with the deck.
 * Typing is undone a run at a time, like everything else (Ctrl+Z works right here).
 */
export function NotesPane({ controller }: { controller: CanvasController }) {
  const state = useSyncExternalStore(controller.session.subscribe, controller.session.getState)
  const [open, setOpen] = useState(readOpen)
  const slide = controller.session.currentSlide()
  const number = state.deck.slides.indexOf(slide) + 1

  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(OPEN_KEY, open ? '0' : '1')
    } catch {
      // Storage blocked: the pane still opens and closes, it just isn't remembered.
    }
  }

  return (
    <section className={`notes-pane${open ? ' is-open' : ''}`} aria-label="Speaker notes">
      <button type="button" className="notes-toggle" aria-expanded={open} aria-controls="notes-text" onClick={toggle}>
        {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        Notes
      </button>
      {open && (
        <textarea
          id="notes-text"
          className="notes-text"
          aria-label={`Speaker notes for slide ${number}`}
          placeholder="Notes for this slide. Only you see them while presenting."
          spellCheck
          value={slide.notes}
          onChange={(e) => controller.editNotes(e.target.value)}
          onBlur={() => controller.endNotes()}
          onKeyDown={(e) => {
            const mod = (e.ctrlKey || e.metaKey) && !e.altKey
            const key = e.key.toLowerCase()
            if (!mod || (key !== 'z' && key !== 'y')) return
            // The deck's undo, not the browser's: notes undo like the rest of the deck.
            e.preventDefault()
            e.stopPropagation()
            if (key === 'y' || e.shiftKey) controller.redo()
            else controller.undo()
          }}
        />
      )}
    </section>
  )
}
