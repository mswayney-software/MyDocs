import { ariaShortcut, tooltip } from '@mysuite/core/shortcuts'
import { Copy, Redo2, SquarePlus, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { CanvasController } from '../canvas/controller'
import { SlideGrid } from './SlideGrid'

const ICON = { size: 18, strokeWidth: 2, 'aria-hidden': true } as const

function Btn({ label, shortcut, disabled, onClick, children, text }: {
  label: string
  shortcut?: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  /** Show the label beside the icon. */
  text?: boolean
}) {
  return (
    <button
      type="button"
      className={`tb-btn${text ? ' tb-text' : ''}`}
      aria-label={text ? undefined : label}
      title={tooltip(label, shortcut)}
      aria-keyshortcuts={shortcut ? ariaShortcut(shortcut) : undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
      {text && <span>{label}</span>}
    </button>
  )
}

/**
 * The slide sorter: every slide in a grid, for rearranging a whole deck at once. The same
 * actions as the strip, with room to pick many slides. Enter or double-click opens a slide in
 * the editor; Esc goes back to the slide that was open.
 */
export function SorterView({ controller, onClose }: { controller: CanvasController; onClose: () => void }) {
  const state = useSyncExternalStore(controller.session.subscribe, controller.session.getState)
  const { slides: picked } = useSyncExternalStore(controller.subscribe, controller.getState)
  const area = useRef<HTMLDivElement>(null)
  const total = state.deck.slides.length
  const n = picked.length
  const word = n === 1 ? 'slide' : `${n} slides`

  // The keyboard starts on the current slide.
  useEffect(() => {
    area.current?.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus()
  }, [])

  return (
    <div
      ref={area}
      className="sorter"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented && !(e.target as HTMLElement).closest('.popover-panel')) {
          e.preventDefault()
          onClose()
        }
      }}
    >
      <div className="toolbar sorter-bar" role="toolbar" aria-label="Sorter tools">
        <span className="tb-group">
          <Btn label="Undo" shortcut="Mod+Z" disabled={!state.canUndo} onClick={() => controller.undo()}>
            <Undo2 {...ICON} />
          </Btn>
          <Btn label="Redo" shortcut="Mod+Y" disabled={!state.canRedo} onClick={() => controller.redo()}>
            <Redo2 {...ICON} />
          </Btn>
        </span>
        <span className="tb-sep" aria-hidden="true" />
        <span className="tb-group">
          <Btn text label="New slide" shortcut="Mod+M" onClick={() => controller.addSlide()}>
            <SquarePlus {...ICON} />
          </Btn>
          <Btn text label={`Duplicate ${word}`} shortcut="Mod+D" onClick={() => controller.duplicateSlides()}>
            <Copy {...ICON} />
          </Btn>
          <Btn text label={`Delete ${word}`} shortcut="Delete" disabled={n >= total} onClick={() => controller.deleteSlides()}>
            <Trash2 {...ICON} />
          </Btn>
        </span>
        <span className="sorter-count">{n > 1 ? `${n} of ${total} slides picked` : `${total} ${total === 1 ? 'slide' : 'slides'}`}</span>
        <Btn text label="Back to editor" shortcut="Escape" onClick={onClose}>
          <X {...ICON} />
        </Btn>
      </div>
      <SlideGrid
        controller={controller}
        variant="sorter"
        label="All slides"
        onOpen={(id) => {
          controller.openSlide(id)
          onClose()
        }}
      />
    </div>
  )
}
