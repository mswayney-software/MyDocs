import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import type { Media } from '../deck/media'
import type { Slide, TextElement, Theme } from '../deck/schema'
import { placeholderHint, textBoxStyle } from '../slide/style'
import { SlideView } from '../slide/SlideView'
import { slideTextExtensions } from '../text/extensions'
import { SNAP_PX, type CanvasController } from './controller'
import { HANDLES, lineEnds, resizeBox, round, type Box, type Handle } from './geometry'

/** A press that moves less than this (screen pixels) is a click, not a drag. */
const DRAG_START_PX = 3

type Press =
  | { kind: 'move'; x: number; y: number; wasOnlySelection: boolean; id: string; dragging: false | { boxes: Map<string, Box> } }
  | { kind: 'resize'; x: number; y: number; id: string; handle: Handle; base: Box; keepRatio: boolean; minH: number }
  /** Dragging one end of a line or arrow; `fixed` is the other end, in slide units. */
  | { kind: 'end'; x: number; y: number; id: string; which: 'from' | 'to'; moving: Pt; fixed: Pt }
  /** Drawing a selection rectangle from an empty part of the slide. */
  | { kind: 'marquee'; x: number; y: number; start: Pt; add: boolean; moved: boolean }

interface Pt {
  x: number
  y: number
}

const isLine = (el: { type: string; shape?: string } | undefined) => el?.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow')

/**
 * The slide being edited: drawn by SlideView, with selection, handles, guides and the one live
 * text editor on top, all in slide units inside one scaled layer.
 */
export function Canvas({ controller, slide, theme, media, size, onDropPicture }: {
  controller: CanvasController
  slide: Slide
  theme: Theme
  media: Media
  size: { width: number; height: number }
  /** A picture file dropped on the slide, with the slide point it was dropped at. */
  onDropPicture?: (file: File, at: { x: number; y: number }) => void
}) {
  const ui = useSyncExternalStore(controller.subscribe, controller.getState)
  const stage = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const press = useRef<Press | null>(null)
  const [scale, setScale] = useState(0.5)
  const [marquee, setMarquee] = useState<Box | null>(null)

  // Fit the slide to the space it has.
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = () => {
      const pad = 48
      const s = Math.min((el.clientWidth - pad) / size.width, (el.clientHeight - pad) / size.height)
      setScale(Math.max(0.05, s))
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return // unit tests (jsdom)
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [size.width, size.height])

  // Escape mid-drag puts everything back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && press.current) {
        e.preventDefault()
        e.stopPropagation()
        press.current = null
        controller.cancelDrag()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [controller])

  const toUnits = (dxPx: number, dyPx: number) => ({ dx: dxPx / scale, dy: dyPx / scale })
  /** A screen point as a point on the slide. */
  const toSlide = (clientX: number, clientY: number): Pt => {
    const r = layer.current!.getBoundingClientRect()
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // Inside the live editor, the editor handles the pointer (placing the caret, selecting).
    if (target.closest('.ProseMirror')) return
    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined
    const end = target.closest<HTMLElement>('[data-end]')?.dataset.end as 'from' | 'to' | undefined
    const sel = ui.selected
    if (end && sel.length === 1) {
      const el = slide.elements.find((x) => x.id === sel[0])
      if (!el || el.type !== 'shape') return
      const ends = lineEnds(el)
      const abs = (p: Pt) => ({ x: el.x + p.x, y: el.y + p.y })
      press.current = {
        kind: 'end', x: e.clientX, y: e.clientY, id: el.id, which: end,
        moving: abs(end === 'from' ? ends.from : ends.to),
        fixed: abs(end === 'from' ? ends.to : ends.from),
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    if (handle && sel.length === 1) {
      const el = slide.elements.find((x) => x.id === sel[0])
      if (!el) return
      controller.finishEditing()
      press.current = {
        kind: 'resize', x: e.clientX, y: e.clientY, id: el.id, handle,
        base: { x: el.x, y: el.y, w: el.w, h: el.h },
        keepRatio: el.type === 'image',
        minH: el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow') ? 0 : 16,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    const id = target.closest<HTMLElement>('[data-id]')?.dataset.id
    if (!id) {
      // An empty part of the slide: drag out a rectangle to select what it touches.
      const add = e.shiftKey || e.ctrlKey || e.metaKey
      if (!add) controller.clearSelection()
      stage.current?.focus({ preventScroll: true })
      press.current = { kind: 'marquee', x: e.clientX, y: e.clientY, start: toSlide(e.clientX, e.clientY), add, moved: false }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    e.preventDefault()
    stage.current?.focus({ preventScroll: true })
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      controller.toggle(id)
      return
    }
    const wasOnlySelection = sel.length === 1 && sel[0] === id && ui.editingId !== id
    if (!sel.includes(id)) controller.select([id])
    press.current = { kind: 'move', x: e.clientX, y: e.clientY, wasOnlySelection, id, dragging: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current
    if (!p) return
    const { dx, dy } = toUnits(e.clientX - p.x, e.clientY - p.y)
    const threshold = SNAP_PX / scale
    if (p.kind === 'marquee') {
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START_PX) return
      p.moved = true
      const now = toSlide(e.clientX, e.clientY)
      setMarquee({ x: Math.min(p.start.x, now.x), y: Math.min(p.start.y, now.y), w: Math.abs(now.x - p.start.x), h: Math.abs(now.y - p.start.y) })
      return
    }
    if (p.kind === 'end') {
      let to = { x: p.moving.x + dx, y: p.moving.y + dy }
      // Shift keeps the line level, upright, or at 45 degrees.
      if (e.shiftKey) to = constrain(p.fixed, to)
      const [from, end] = p.which === 'to' ? [p.fixed, to] : [to, p.fixed]
      controller.resizeTo(
        p.id,
        {
          x: round(Math.min(from.x, end.x)),
          y: round(Math.min(from.y, end.y)),
          w: round(Math.abs(end.x - from.x)),
          h: round(Math.abs(end.y - from.y)),
          flipH: from.x > end.x,
          flipV: from.y > end.y,
        },
        { x: [], y: [] },
      )
      return
    }
    if (p.kind === 'resize') {
      const { box, guides } = resizeBox(p.base, p.handle, dx, dy, {
        keepRatio: p.keepRatio || e.shiftKey,
        slide: e.altKey ? undefined : size,
        threshold,
        minH: p.minH,
      })
      controller.resizeTo(p.id, box, guides)
      return
    }
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START_PX) return
      p.dragging = controller.dragStart()
    }
    // Alt turns snapping off for fine placement.
    controller.dragTo(p.dragging, dx, dy, threshold, !e.altKey)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current
    press.current = null
    if (!p) return
    if (p.kind === 'marquee') {
      setMarquee(null)
      if (p.moved) {
        const now = toSlide(e.clientX, e.clientY)
        controller.selectInRect(
          { x: Math.min(p.start.x, now.x), y: Math.min(p.start.y, now.y), w: Math.abs(now.x - p.start.x), h: Math.abs(now.y - p.start.y) },
          p.add,
        )
      }
      return
    }
    if (p.kind === 'resize' || p.kind === 'end' || p.dragging) {
      controller.endDrag()
      return
    }
    // A click on a text box that was already selected starts typing where it was clicked.
    const el = slide.elements.find((x) => x.id === p.id)
    if (p.wasOnlySelection && el?.type === 'text') controller.startEditing(el.id, { x: e.clientX, y: e.clientY })
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id
    const el = slide.elements.find((x) => x.id === id)
    if (el?.type === 'text' && ui.editingId !== el.id) controller.startEditing(el.id, { x: e.clientX, y: e.clientY })
  }

  const editing = slide.elements.find((x) => x.id === ui.editingId)
  const selected = slide.elements.filter((x) => ui.selected.includes(x.id))
  const inv = 1 / scale

  return (
    <div
      className="stage"
      ref={stage}
      tabIndex={0}
      role="application"
      aria-roledescription="slide editor"
      aria-label={`Slide editor. ${selected.length ? `${selected.length} selected.` : 'Nothing selected.'} Tab moves between items, arrows move them, Enter edits text.`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/')) ?? e.dataTransfer.files[0]
        if (!file || !onDropPicture) return
        e.preventDefault()
        const at = toSlide(e.clientX, e.clientY)
        onDropPicture(file, { x: Math.min(Math.max(at.x, 0), size.width), y: Math.min(Math.max(at.y, 0), size.height) })
      }}
      onPointerDown={(e) => {
        // A press on the gray area around the slide clears the selection.
        if (e.target === stage.current) {
          controller.clearSelection()
          stage.current?.focus({ preventScroll: true })
        }
      }}
    >
      <div className="slide-frame" style={{ width: size.width * scale, height: size.height * scale }}>
        <div
          className="slide-layer"
          ref={layer}
          style={{ width: size.width, height: size.height, transform: `scale(${scale})`, ['--inv' as string]: inv }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            press.current = null
            setMarquee(null)
            controller.cancelDrag()
          }}
          onDoubleClick={onDoubleClick}
        >
          <SlideView slide={slide} theme={theme} media={media} hints hiddenId={ui.editingId} />
          {editing?.type === 'text' && <LiveTextBox key={editing.id} el={editing} theme={theme} controller={controller} />}
          {selected.map((el) => (
            <div
              key={el.id}
              className={`sel-box${ui.editingId === el.id ? ' sel-editing' : ''}`}
              style={{ left: el.x, top: el.y, width: el.w, height: Math.max(el.h, 0) }}
              aria-hidden="true"
            >
              {selected.length === 1 &&
                ui.editingId !== el.id &&
                !isLine(el) &&
                HANDLES.map((h) => <div key={h} className={`handle handle-${h}`} data-handle={h} />)}
            </div>
          ))}
          {selected.length === 1 && selected[0].type === 'shape' && isLine(selected[0]) && <LineEnds el={selected[0]} />}
          {marquee && (
            <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} aria-hidden="true" />
          )}
          {ui.guides?.x.map((x) => <div key={`gx${x}`} className="guide guide-v" style={{ left: x }} aria-hidden="true" />)}
          {ui.guides?.y.map((y) => <div key={`gy${y}`} className="guide guide-h" style={{ top: y }} aria-hidden="true" />)}
        </div>
      </div>
    </div>
  )
}

/** The two end handles of a selected line or arrow. */
function LineEnds({ el }: { el: { x: number; y: number; w: number; h: number; flipH?: boolean; flipV?: boolean } }) {
  const { from, to } = lineEnds(el)
  return (
    <>
      <div className="handle handle-end" data-end="from" style={{ left: el.x + from.x, top: el.y + from.y }} aria-hidden="true" />
      <div className="handle handle-end" data-end="to" style={{ left: el.x + to.x, top: el.y + to.y }} aria-hidden="true" />
    </>
  )
}

/** The nearest of level, upright, or 45 degrees from a fixed point. */
function constrain(fixed: Pt, p: Pt): Pt {
  const dx = p.x - fixed.x
  const dy = p.y - fixed.y
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  const len = Math.hypot(dx, dy)
  return { x: fixed.x + Math.round(Math.cos(angle) * len), y: fixed.y + Math.round(Math.sin(angle) * len) }
}

/** The one live editor, sitting exactly where the text box is, with the same type styles. */
function LiveTextBox({ el, theme, controller }: { el: TextElement; theme: Theme; controller: CanvasController }) {
  const editor = useEditor({
    extensions: slideTextExtensions(),
    content: el.content,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'slide-text',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': el.role ? placeholderHint(el.role).replace(/^Click to add /, '').replace(/^./, (c) => c.toUpperCase()) : 'Text box',
        spellcheck: 'true',
      },
    },
  })

  useLayoutEffect(() => {
    controller.attachEditor(editor)
    return () => controller.attachEditor(null)
  }, [controller, editor])

  return (
    <div className="el el-text el-live" style={{ left: el.x, top: el.y, width: el.w, height: el.h, ...textBoxStyle(el, theme) }}>
      <EditorContent editor={editor} />
    </div>
  )
}
