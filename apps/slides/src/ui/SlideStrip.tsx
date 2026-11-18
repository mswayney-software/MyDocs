import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import type { CanvasController } from '../canvas/controller'
import { SlideView } from '../slide/SlideView'

/** Thumbnail width in screen pixels. */
const THUMB_W = 136

/**
 * The slide strip: a thumbnail per slide. Click to open; Up and Down move between slides;
 * Delete removes one; right-click or the Menu key for New slide and Delete slide.
 */
export function SlideStrip({ controller }: { controller: CanvasController }) {
  const { deck, slideId } = useSyncExternalStore(controller.session.subscribe, controller.session.getState)
  const media = controller.session.getMedia()
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const list = useRef<HTMLOListElement>(null)
  const scale = THUMB_W / deck.size.width

  // Keep the current slide in view.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [slideId])

  const focusThumb = (id: string) =>
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-slide="${id}"]`)?.focus())

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: string, i: number) => {
    const go = (j: number) => {
      const s = deck.slides[j]
      if (!s) return
      controller.goTo(s.id)
      focusThumb(s.id)
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(i + 1)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(deck.slides.length - 1)
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      const next = deck.slides[i + 1] ?? deck.slides[i - 1]
      controller.deleteSlide(id)
      if (next) focusThumb(next.id)
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      const r = e.currentTarget.getBoundingClientRect()
      setMenu({ id, x: r.left + 24, y: r.top + 24 })
    } else return
    e.preventDefault()
  }

  return (
    <nav className="slide-strip" aria-label="Slides">
      <ol ref={list}>
        {deck.slides.map((s, i) => (
          <li key={s.id}>
            <span className="strip-num" aria-hidden="true">{i + 1}</span>
            <button
              type="button"
              className="strip-thumb"
              data-slide={s.id}
              aria-current={s.id === slideId}
              aria-label={`Slide ${i + 1}`}
              tabIndex={s.id === slideId ? 0 : -1}
              style={{ width: THUMB_W, height: deck.size.height * scale }}
              onClick={() => controller.goTo(s.id)}
              onKeyDown={(e) => onKeyDown(e, s.id, i)}
              onContextMenu={(e) => {
                e.preventDefault()
                controller.goTo(s.id)
                setMenu({ id: s.id, x: e.clientX, y: e.clientY })
              }}
            >
              <span className="thumb-scale" style={{ width: deck.size.width, height: deck.size.height, transform: `scale(${scale})` }}>
                <SlideView slide={s} theme={deck.theme} media={media} />
              </span>
            </button>
          </li>
        ))}
      </ol>
      {menu && (
        <StripMenu
          x={menu.x}
          y={menu.y}
          canDelete={deck.slides.length > 1}
          onClose={() => {
            setMenu(null)
            focusThumb(controller.session.getState().slideId)
          }}
          onNew={() => controller.addSlide()}
          onDelete={() => controller.deleteSlide(menu.id)}
        />
      )}
    </nav>
  )
}

function StripMenu({ x, y, canDelete, onClose, onNew, onDelete }: {
  x: number
  y: number
  canDelete: boolean
  onClose: () => void
  onNew: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [onClose])
  const pick = (fn: () => void) => () => {
    fn()
    onClose()
  }
  return (
    <div
      ref={ref}
      className="popover-panel strip-menu"
      role="menu"
      aria-label="Slide"
      style={{ position: 'fixed', left: x, top: y }}
      onKeyDown={(e) => {
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLElement)
        if (e.key === 'Escape') onClose()
        else if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus()
        else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus()
        else return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <button type="button" role="menuitem" className="menu-item" onClick={pick(onNew)}>
        <span className="menu-check" aria-hidden="true" />
        <span className="menu-label">New slide</span>
      </button>
      <button type="button" role="menuitem" className="menu-item" disabled={!canDelete} onClick={pick(onDelete)}>
        <span className="menu-check" aria-hidden="true" />
        <span className="menu-label">Delete slide</span>
      </button>
    </div>
  )
}
