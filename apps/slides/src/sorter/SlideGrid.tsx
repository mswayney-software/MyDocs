import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { CanvasController } from '../canvas/controller'
import { cellAt, columnsFor, contentHeight, gapAt, visibleRange, type Grid } from './order'
import { SlideMenu, type SlideMenuAction } from './SlideMenu'
import { Thumbnail } from './Thumbnail'

/** The two lists of slides. Same thumbnails and actions; the sorter is a grid of bigger ones. */
const VARIANTS = {
  strip: { thumbW: 136, gapX: 0, gapY: 10, extraW: 28, extraH: 0, padX: 8, padY: 12 },
  sorter: { thumbW: 232, gapX: 24, gapY: 18, extraW: 0, extraH: 26, padX: 24, padY: 20 },
} as const
/** Thumbnail border, both sides. */
const BORDER = 4
/** Pointer travel before a press becomes a drag, in screen pixels. */
const DRAG_START_PX = 5
/** While dragging, this close to the top or bottom edge scrolls the list. */
const SCROLL_EDGE_PX = 48
const SCROLL_MAX_SPEED = 18

interface Press {
  id: string
  x: number
  y: number
  pointerId: number
  ctrl: boolean
  shift: boolean
  dragging: boolean
  lastX: number
  lastY: number
}

interface Drop {
  gap: number
  row: number
  col: number
}

/**
 * Every slide as a thumbnail: a column in the strip, a grid in the sorter. Click opens a slide,
 * Ctrl+click and Shift+click pick several, drag moves them, and the keyboard does all of it
 * (arrows, Shift+arrows, Ctrl+arrows to move, Delete, Ctrl+D, the Menu key).
 *
 * Only the thumbnails on screen are drawn (plus the current one, which holds the keyboard
 * focus): a 60-slide deck costs about what a 10-slide one does. Every thumbnail is the same
 * size, so where each one goes, and where a drag would drop, comes from arithmetic alone.
 */
export function SlideGrid({ controller, variant, label, onOpen }: {
  controller: CanvasController
  variant: 'strip' | 'sorter'
  label: string
  /** Enter or double-click (the sorter): open this slide in the editor. */
  onOpen?: (id: string) => void
}) {
  const { deck, slideId } = useSyncExternalStore(controller.session.subscribe, controller.session.getState)
  const { editor, editingId, slides: picked } = useSyncExternalStore(controller.subscribe, controller.getState)
  const media = controller.session.getMedia()
  const v = VARIANTS[variant]
  const thumbH = (v.thumbW * deck.size.height) / deck.size.width
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 800, width: 800 })
  const [drop, setDrop] = useState<Drop | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const press = useRef<Press | null>(null)
  const anchor = useRef(slideId)
  const focusAfter = useRef(false)

  const cellW = v.thumbW + BORDER + v.gapX + v.extraW
  const cols = variant === 'strip' ? 1 : columnsFor(view.width, cellW, v.padX)
  const grid: Grid = {
    count: deck.slides.length,
    cols,
    cellW,
    cellH: thumbH + BORDER + v.gapY + v.extraH,
    // The sorter's grid sits in the middle of the window.
    padX: variant === 'strip' ? v.padX : Math.max(v.padX, (view.width - cols * cellW + v.gapX) / 2),
    padY: v.padY,
  }
  const gridRef = useRef(grid)
  useLayoutEffect(() => {
    gridRef.current = grid
  })
  const index = deck.slides.findIndex((s) => s.id === slideId)
  const pickedSet = new Set(picked)

  // The size of the visible area, and where it is scrolled to.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight || 800, width: el.clientWidth || 800 })
    measure()
    if (typeof ResizeObserver === 'undefined') return // unit tests (jsdom)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keep the current slide on screen, and give it the keyboard after a key acted on it.
  useLayoutEffect(() => {
    const el = scroller.current
    const g = gridRef.current // brought up to date by the effect above, which runs first
    if (!el || index < 0) return
    const { y } = cellAt(g, index)
    if (y < el.scrollTop) el.scrollTop = y - g.padY
    else if (y + g.cellH > el.scrollTop + el.clientHeight) el.scrollTop = y + g.cellH - el.clientHeight + g.padY
    if (focusAfter.current) {
      focusAfter.current = false
      el.querySelector<HTMLElement>(`[data-slide="${slideId}"]`)?.focus({ preventScroll: true })
    }
    // Only when the slide, the order or the columns change: not on every scroll.
  }, [slideId, index, deck.slides, grid.cols])

  const say = (text: string) => setAnnouncement((now) => (now === text ? `${text} ` : text))
  const sayPosition = (moved: boolean) => {
    if (!moved) return
    const n = controller.getState().slides.length
    const where = `position ${controller.slidePosition()} of ${controller.session.getState().deck.slides.length}`
    say(n === 1 ? `Slide moved to ${where}` : `${n} slides moved to ${where}`)
  }

  // ---- pointer: click, Ctrl+click, Shift+click, drag ------------------------------------

  const pointToDrop = useCallback((clientX: number, clientY: number): Drop | null => {
    const el = scroller.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return gapAt(gridRef.current, clientX - r.left + el.scrollLeft, clientY - r.top + el.scrollTop)
  }, [])

  const scrollTimer = useRef<number | null>(null)
  const stopAutoScroll = () => {
    if (scrollTimer.current !== null) cancelAnimationFrame(scrollTimer.current)
    scrollTimer.current = null
  }
  const autoScroll = () => {
    const el = scroller.current
    const p = press.current
    if (!el || !p?.dragging) return stopAutoScroll()
    const r = el.getBoundingClientRect()
    const fromTop = p.lastY - r.top
    const fromBottom = r.bottom - p.lastY
    const speed = (d: number) => Math.ceil(((SCROLL_EDGE_PX - Math.max(0, d)) / SCROLL_EDGE_PX) * SCROLL_MAX_SPEED)
    const dy = fromTop < SCROLL_EDGE_PX ? -speed(fromTop) : fromBottom < SCROLL_EDGE_PX ? speed(fromBottom) : 0
    if (dy) {
      el.scrollTop += dy
      setDrop(pointToDrop(p.lastX, p.lastY))
    }
    scrollTimer.current = requestAnimationFrame(autoScroll)
  }

  const endPress = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onEscape, true)
    stopAutoScroll()
    press.current = null
    setDrop(null)
  }

  function onMove(e: PointerEvent) {
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    p.lastX = e.clientX
    p.lastY = e.clientY
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START_PX) return
      p.dragging = true
      // Dragging a slide that isn't picked moves that slide alone.
      if (!controller.getState().slides.includes(p.id)) controller.openSlide(p.id)
      scrollTimer.current = requestAnimationFrame(autoScroll)
    }
    setDrop(pointToDrop(e.clientX, e.clientY))
  }

  function onUp(e: PointerEvent) {
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    if (p.dragging) {
      const at = pointToDrop(e.clientX, e.clientY)
      endPress()
      if (at) sayPosition(controller.moveSlides(at.gap))
      return
    }
    endPress()
    if (p.ctrl) controller.toggleSlide(p.id)
    else if (p.shift) controller.pickSlideRange(anchor.current, p.id)
    else controller.openSlide(p.id)
    if (!p.shift) anchor.current = p.id
  }

  function onCancel() {
    endPress()
  }

  function onEscape(e: globalThis.KeyboardEvent) {
    if (e.key !== 'Escape' || !press.current?.dragging) return
    e.preventDefault()
    e.stopPropagation()
    endPress()
  }

  const onPointerDown = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0 || press.current) return
    press.current = {
      id, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, pointerId: e.pointerId,
      ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, dragging: false,
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onEscape, true)
  }

  // ---- keyboard -------------------------------------------------------------------------

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).dataset.slide) return
    const slides = deck.slides
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -grid.cols, ArrowDown: grid.cols }
    const go = (j: number) => {
      const target = slides[Math.max(0, Math.min(slides.length - 1, j))]
      if (!target) return
      focusAfter.current = true
      if (e.shiftKey) controller.pickSlideRange(anchor.current, target.id)
      else {
        controller.openSlide(target.id)
        anchor.current = target.id
      }
    }
    const move = (fn: () => boolean) => {
      focusAfter.current = true
      sayPosition(fn())
    }
    if (key in steps) {
      if (mod) move(() => controller.moveSlidesBy(steps[key]))
      else go(index + steps[key])
    } else if (key === 'Home' || key === 'End') {
      if (mod) move(() => controller.moveSlides(key === 'Home' ? 0 : slides.length))
      else go(key === 'Home' ? 0 : slides.length - 1)
    } else if (mod && key === 'a') controller.pickAllSlides()
    else if (mod && key === 'd') {
      focusAfter.current = true
      controller.duplicateSlides()
    } else if (mod && (key === 'z' || key === 'y')) {
      focusAfter.current = true
      if (key === 'y' || e.shiftKey) controller.redo()
      else controller.undo()
    } else if (!mod && (key === 'Delete' || key === 'Backspace')) {
      focusAfter.current = true
      const n = controller.getState().slides.length
      controller.deleteSlides()
      say(n === 1 ? 'Slide deleted' : `${n} slides deleted`)
    } else if (!mod && key === 'Enter' && onOpen) onOpen(slideId)
    else if (key === 'ContextMenu' || (e.shiftKey && key === 'F10')) {
      const r = (e.target as HTMLElement).getBoundingClientRect()
      setMenu({ x: r.left + 24, y: r.top + 24 })
    } else return
    e.preventDefault()
    e.stopPropagation()
  }

  // ---- the menu -------------------------------------------------------------------------

  const n = picked.length
  const slidesWord = n === 1 ? 'slide' : `${n} slides`
  const first = deck.slides.findIndex((s) => pickedSet.has(s.id))
  const last = deck.slides.findLastIndex((s) => pickedSet.has(s.id))
  const together = last - first + 1 === n
  const back = variant === 'strip' ? 'Mod+ArrowUp' : 'Mod+ArrowLeft'
  const forward = variant === 'strip' ? 'Mod+ArrowDown' : 'Mod+ArrowRight'
  const actions: SlideMenuAction[] = [
    { label: 'New slide', shortcut: 'Mod+M', run: () => controller.addSlide() },
    { label: `Duplicate ${slidesWord}`, shortcut: 'Mod+D', run: () => controller.duplicateSlides() },
    { label: 'Move earlier', shortcut: back, disabled: first === 0 && together, run: () => sayPosition(controller.moveSlidesBy(-1)) },
    { label: 'Move later', shortcut: forward, disabled: last === deck.slides.length - 1 && together, run: () => sayPosition(controller.moveSlidesBy(1)) },
    { label: `Delete ${slidesWord}`, shortcut: 'Delete', disabled: n >= deck.slides.length, run: () => controller.deleteSlides() },
  ]

  // ---- drawing --------------------------------------------------------------------------

  const [from, to] = visibleRange(grid, view.top, view.height)
  const shown: number[] = []
  for (let i = from; i < to; i++) shown.push(i)
  if (index >= 0 && (index < from || index >= to)) shown.push(index)
  const dragging = drop ? pickedSet : null

  let marker: { x: number; y: number; vertical: boolean } | null = null
  if (drop) {
    if (grid.cols === 1) marker = { x: grid.padX, y: grid.padY + drop.gap * grid.cellH - v.gapY / 2, vertical: false }
    else marker = { x: grid.padX + drop.col * grid.cellW - v.gapX / 2, y: grid.padY + drop.row * grid.cellH, vertical: true }
  }

  return (
    <div
      ref={scroller}
      className={`grid-scroll grid-${variant}`}
      onScroll={(e) => {
        const el = e.currentTarget
        setView((now) => (now.top === el.scrollTop ? now : { ...now, top: el.scrollTop }))
      }}
    >
      <div
        role="listbox"
        aria-label={label}
        aria-multiselectable="true"
        aria-orientation={variant === 'strip' ? 'vertical' : undefined}
        className="grid-list"
        style={{ height: contentHeight(grid) }}
        onKeyDown={onKeyDown}
      >
        {shown.map((i) => {
          const s = deck.slides[i]
          const { x, y } = cellAt(grid, i)
          const current = s.id === slideId
          return (
            <div
              key={s.id}
              role="none"
              className={`grid-cell${dragging?.has(s.id) ? ' is-dragged' : ''}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {variant === 'strip' && (
                <span className="strip-num" aria-hidden="true">
                  {i + 1}
                </span>
              )}
              <div
                role="option"
                className="strip-thumb"
                data-slide={s.id}
                aria-label={`Slide ${i + 1}`}
                aria-selected={pickedSet.has(s.id)}
                aria-current={current}
                aria-posinset={i + 1}
                aria-setsize={deck.slides.length}
                tabIndex={current ? 0 : -1}
                style={{ width: v.thumbW, height: thumbH }}
                onPointerDown={(e) => onPointerDown(e, s.id)}
                onDoubleClick={onOpen ? () => onOpen(s.id) : undefined}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (!pickedSet.has(s.id)) controller.openSlide(s.id)
                  setMenu({ x: e.clientX, y: e.clientY })
                }}
              >
                <Thumbnail
                  slide={s}
                  theme={deck.theme}
                  media={media}
                  size={deck.size}
                  width={v.thumbW}
                  editor={current ? editor : null}
                  editingId={current ? editingId : null}
                />
              </div>
              {variant === 'sorter' && (
                <span className="sorter-num" aria-hidden="true">
                  {i + 1}
                </span>
              )}
            </div>
          )
        })}
        {marker && (
          <div
            className={`drop-marker${marker.vertical ? ' is-vertical' : ''}`}
            aria-hidden="true"
            style={
              marker.vertical
                ? { transform: `translate(${marker.x - 2}px, ${marker.y}px)`, height: thumbH + BORDER }
                : { transform: `translate(${marker.x}px, ${marker.y - 2}px)`, width: v.thumbW + BORDER + v.extraW }
            }
          />
        )}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      {menu && (
        <SlideMenu
          x={menu.x}
          y={menu.y}
          actions={actions}
          onClose={() => {
            setMenu(null)
            focusAfter.current = true
            scroller.current?.querySelector<HTMLElement>(`[data-slide="${controller.session.getState().slideId}"]`)?.focus()
          }}
        />
      )}
    </div>
  )
}
