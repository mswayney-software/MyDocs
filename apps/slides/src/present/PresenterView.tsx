import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Media } from '../deck/media'
import type { Deck } from '../deck/schema'
import { usePresentKeys } from './keys'
import { PresentStage } from './PresentStage'
import { formatElapsed, loadNoteSize, NOTE_SIZE_KEY, NOTE_SIZES } from './presenter-settings'
import { startAt, type ShowAction, type ShowState } from './state'

const ICON = { size: 18, strokeWidth: 2, 'aria-hidden': true } as const

/** Elapsed time, with pause and reset. Starts running. */
function useTimer() {
  const [t, setT] = useState(() => ({ base: 0, since: Date.now() as number | null }))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  const elapsed = t.base + (t.since === null ? 0 : Math.max(0, now - t.since))
  return {
    now,
    elapsed,
    running: t.since !== null,
    toggle: () => setT((x) => (x.since === null ? { ...x, since: Date.now() } : { base: x.base + Date.now() - x.since, since: null })),
    reset: () => setT((x) => ({ base: 0, since: x.since === null ? null : Date.now() })),
  }
}

/**
 * The presenter's screen (spec, UI): the current slide large, the next one small, the notes with
 * adjustable text size, an elapsed timer with pause and reset, the clock, and the slide number.
 * The audience sees only the slide, in the other window.
 */
export function PresenterView({ deck, media, show, onAction, onEnd, audienceReady }: {
  deck: Deck
  media: Media
  show: ShowState
  onAction: (a: ShowAction) => void
  onEnd: () => void
  /** The audience window is open and showing the deck. */
  audienceReady: boolean
}) {
  const count = deck.slides.length
  const slide = deck.slides[Math.min(show.index, count - 1)]
  const timer = useTimer()
  const [noteSize, setNoteSize] = useState(loadNoteSize)
  const root = useRef<HTMLDivElement>(null)

  usePresentKeys(onAction, (e) => {
    if (e.key !== 'Escape') return false
    onEnd()
    return true
  })
  useEffect(() => {
    root.current?.focus()
  }, [])

  const resize = (dir: 1 | -1) => {
    const i = NOTE_SIZES.indexOf(noteSize)
    const next = NOTE_SIZES[Math.max(0, Math.min(NOTE_SIZES.length - 1, i + dir))]
    setNoteSize(next)
    try {
      localStorage.setItem(NOTE_SIZE_KEY, String(next))
    } catch {
      // Not remembered on this device; it still applies now.
    }
  }

  const nextIndex = show.ended ? null : show.index + 1 < count ? show.index + 1 : null
  const position = show.ended ? 'End of presentation' : `Slide ${show.index + 1} of ${count}`
  const clock = new Date(timer.now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <main ref={root} className="presenter" tabIndex={-1} aria-label="Presenter view">
      <div className="presenter-top">
        <span className="presenter-count" role="status" aria-live="polite">
          {position}
          {show.blank ? ' · screen blanked' : ''}
        </span>
        <span className="presenter-timer" role="group" aria-label="Timer">
          <span className="presenter-elapsed" aria-label={`Elapsed time ${formatElapsed(timer.elapsed)}`}>
            {formatElapsed(timer.elapsed)}
          </span>
          <button type="button" className="presenter-btn" aria-label={timer.running ? 'Pause timer' : 'Resume timer'} title={timer.running ? 'Pause timer' : 'Resume timer'} onClick={timer.toggle}>
            {timer.running ? <Pause {...ICON} /> : <Play {...ICON} />}
          </button>
          <button type="button" className="presenter-btn" aria-label="Reset timer" title="Reset timer" onClick={timer.reset}>
            <RotateCcw {...ICON} />
          </button>
        </span>
        <span className="presenter-clock" aria-label={`Time ${clock}`}>
          {clock}
        </span>
        <button type="button" className="presenter-btn presenter-end" title="End presentation (Esc)" onClick={onEnd}>
          <X {...ICON} /> End presentation
        </button>
      </div>
      {!audienceReady && (
        <p className="presenter-note" role="status">
          Opening the audience window…
        </p>
      )}
      {audienceReady && (
        <p className="presenter-note">
          Drag the audience window onto the projector’s screen, then press <kbd>F</kbd> in it for full screen.
        </p>
      )}
      <div className="presenter-main">
        <section className="presenter-current" aria-label="Current slide">
          <PresentStage deck={deck} media={media} show={show} animate={false} label={position} />
        </section>
        <div className="presenter-side">
          <section className="presenter-next" aria-label="Next slide">
            <h2 className="presenter-label">Next</h2>
            <div className="presenter-next-slide">
              {nextIndex !== null ? (
                <PresentStage deck={deck} media={media} show={startAt(nextIndex)} animate={false} label={`Slide ${nextIndex + 1}`} />
              ) : (
                <div className="presenter-none">{show.ended ? 'Nothing more' : 'End of presentation'}</div>
              )}
            </div>
          </section>
          <section className="presenter-notes" aria-label="Speaker notes">
            <div className="presenter-notes-head">
              <h2 className="presenter-label">Notes</h2>
              <button type="button" className="presenter-btn" aria-label="Smaller notes text" title="Smaller notes text" disabled={noteSize === NOTE_SIZES[0]} onClick={() => resize(-1)}>
                <AArrowDown {...ICON} />
              </button>
              <button type="button" className="presenter-btn" aria-label="Larger notes text" title="Larger notes text" disabled={noteSize === NOTE_SIZES.at(-1)} onClick={() => resize(1)}>
                <AArrowUp {...ICON} />
              </button>
            </div>
            <div className="presenter-notes-text" style={{ fontSize: noteSize }} tabIndex={0}>
              {show.ended ? '' : slide.notes || <span className="presenter-none-inline">No notes for this slide.</span>}
            </div>
          </section>
        </div>
      </div>
      <div className="presenter-controls" role="toolbar" aria-label="Presentation controls">
        <button type="button" className="presenter-btn" title="Previous slide (←)" onClick={() => onAction('prev')}>
          <ChevronLeft {...ICON} /> Previous
        </button>
        <button type="button" className="presenter-btn presenter-primary" title="Next slide (→ or space)" onClick={() => onAction('next')}>
          Next <ChevronRight {...ICON} />
        </button>
        <button type="button" className="presenter-btn" aria-pressed={show.blank} title="Blank the audience’s screen (B)" onClick={() => onAction('blank')}>
          <Square {...ICON} /> Blank screen
        </button>
      </div>
    </main>
  )
}
