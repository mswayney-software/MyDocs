import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Media } from '../deck/media'
import type { Deck } from '../deck/schema'
import { PresentStage } from './PresentStage'
import { usePresentKeys } from './keys'
import type { ShowAction, ShowState } from './state'

/** The little bar shows on a mouse move, and hides again after this long. */
export const BAR_HIDE_MS = 2500
const ICON = { size: 20, strokeWidth: 2, 'aria-hidden': true } as const

/**
 * The slide and nothing else (spec, UI: Present). Arrow keys, space, Page Up and Down and a click
 * move through the deck; B blanks the screen. Moving the mouse shows a small bar with previous,
 * next, the slide number and exit, which hides again. Used by Present and by the audience's
 * window in Presenter view.
 */
export function PresentScreen({ deck, media, show, onAction, onExit, exitLabel = 'End presentation', hint, onKey }: {
  deck: Deck
  media: Media
  show: ShowState
  onAction: (a: ShowAction) => void
  onExit: () => void
  exitLabel?: string
  /** A message over the slide (the audience window's first instructions). */
  hint?: ReactNode
  /** Extra keys; return true when handled. */
  onKey?: (e: KeyboardEvent) => boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const count = deck.slides.length

  usePresentKeys(onAction, onKey)
  useEffect(() => {
    root.current?.focus()
    return () => clearTimeout(timer.current)
  }, [])

  const wake = () => {
    setBar(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // A keyboard user working the bar keeps it.
      if (!root.current?.querySelector('.present-bar')?.contains(document.activeElement)) setBar(false)
    }, BAR_HIDE_MS)
  }

  const position = show.ended ? 'End of presentation' : `Slide ${show.index + 1} of ${count}`
  return (
    <main
      ref={root}
      className={`present${bar ? '' : ' is-idle'}`}
      tabIndex={-1}
      aria-label="Presentation"
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) wake()
      }}
      onFocus={(e) => {
        if ((e.target as HTMLElement).closest('.present-bar')) setBar(true)
      }}
      onPointerUp={(e) => {
        // A click on the slide moves on; links on it open instead, and the bar's buttons do their own thing.
        if (e.button !== 0 || (e.target as HTMLElement).closest('a[href], .present-bar, .present-hint')) return
        if (e.pointerType !== 'mouse') wake() // touch: show the bar too, it's the only other control
        onAction('next')
      }}
      onContextMenu={(e) => e.preventDefault()}
      // A file dropped here must not replace the app.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <PresentStage deck={deck} media={media} show={show} label={position} />
      <p className="sr-only" role="status" aria-live="polite">
        {show.blank ? 'Screen blanked' : position}
      </p>
      {hint}
      <div className={`present-bar${bar ? ' is-shown' : ''}`} role="toolbar" aria-label="Presentation controls">
        <button type="button" aria-label="Previous slide" title="Previous slide (←)" onClick={() => onAction('prev')}>
          <ChevronLeft {...ICON} />
        </button>
        <span className="present-count">{show.ended ? 'End' : `${show.index + 1} / ${count}`}</span>
        <button type="button" aria-label="Next slide" title="Next slide (→)" onClick={() => onAction('next')}>
          <ChevronRight {...ICON} />
        </button>
        <button type="button" aria-label={exitLabel} title={`${exitLabel} (Esc)`} onClick={onExit}>
          <X {...ICON} />
        </button>
      </div>
    </main>
  )
}
