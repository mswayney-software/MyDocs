import type { Editor } from '@tiptap/core'
import { newId, textBox } from '../deck/defaults'
import { applyLayout, layoutById, slideWithLayout } from '../deck/layouts'
import type { Media } from '../deck/media'
import type { Color, Element, SHAPES, Slide } from '../deck/schema'
import { themeForDeck } from '../deck/themes'
import type { DeckSession } from '../deck/session'
import { shrinkImage } from '@mysuite/core/images'
import { align, distribute, restack, type AlignKind, type StackMove } from './arrange'
import { bounds, MIN_SIZE, round, snapMove, type Box, type Guides } from './geometry'

export interface UiState {
  /** Selected elements on the current slide. */
  selected: string[]
  /** The text box being edited live; null when none. */
  editingId: string | null
  /** Alignment guides to draw during a drag. */
  guides: Guides | null
  /** The live editor while a text box is being edited. */
  editor: Editor | null
}

/** Pictures are stored at most this many pixels on their long side (spec, decision 5). */
export const MAX_PICTURE_EDGE = 1920
/** A new picture fits inside this share of the slide. */
const PICTURE_FIT = 0.6

type ShapeKind = (typeof SHAPES)[number]

/** Consecutive arrow-key nudges within this long are one undo step. */
const NUDGE_MERGE_MS = 700
/** Each paste lands this far from the last, so copies don't hide each other. */
const PASTE_OFFSET = 20
/** Snap distance in screen pixels (converted to slide units by the canvas scale). */
export const SNAP_PX = 8

interface Clip {
  elements: Element[]
  media: Media
}

/**
 * Selection, live text editing, and the actions on them. One per window. The canvas, toolbar,
 * slide strip and keyboard all act through it, so each action works the same from anywhere.
 * Only one text editor exists at a time: startEditing() mounts it, finishEditing() commits its
 * text to the deck as one undo step and lets it go.
 */
export class CanvasController {
  private state: UiState = { selected: [], editingId: null, guides: null, editor: null }
  private listeners = new Set<() => void>()
  private clip: Clip | null = null
  private pasteCount = 0
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null
  private lastSlideId: string
  /** What the editor started with, to tell whether anything changed. */
  private editStart: unknown = null
  /** Where to put the caret once the editor exists: a click point, or a character typed to start. */
  private pendingCaret: { x: number; y: number } | { char: string } | 'end' | 'all' | null = null
  readonly session: DeckSession

  constructor(session: DeckSession) {
    this.session = session
    this.lastSlideId = session.getState().slideId
    session.subscribe(this.onSession)
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = () => this.state

  private set(patch: Partial<UiState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  /** Keep the selection honest when the deck changes underneath it (undo, open, delete). */
  private onSession = () => {
    const s = this.session.getState()
    if (s.slideId !== this.lastSlideId) {
      this.lastSlideId = s.slideId
      if (this.state.editingId) this.dropEditor()
      if (this.state.selected.length) this.set({ selected: [] })
      return
    }
    const ids = new Set(this.session.currentSlide().elements.map((e) => e.id))
    if (this.state.editingId && !ids.has(this.state.editingId)) this.dropEditor()
    const kept = this.state.selected.filter((id) => ids.has(id))
    if (kept.length !== this.state.selected.length) this.set({ selected: kept })
  }

  private elements() {
    return this.session.currentSlide().elements
  }
  private selectedElements() {
    const sel = new Set(this.state.selected)
    return this.elements().filter((e) => sel.has(e.id))
  }

  // ---- selection ----------------------------------------------------------------------

  select(ids: string[]) {
    if (this.state.editingId && !ids.includes(this.state.editingId)) this.finishEditing()
    this.set({ selected: ids })
  }
  toggle(id: string) {
    const sel = this.state.selected
    this.select(sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id])
  }
  clearSelection() {
    this.finishEditing()
    if (this.state.selected.length) this.set({ selected: [] })
  }
  selectAll() {
    this.finishEditing()
    this.set({ selected: this.elements().map((e) => e.id) })
  }
  /** Tab and Shift+Tab: the next element in drawing order, wrapping around. */
  cycle(dir: 1 | -1) {
    const els = this.elements()
    if (!els.length) return
    const current = els.findIndex((e) => e.id === this.state.selected.at(-1))
    const next = current < 0 ? (dir > 0 ? 0 : els.length - 1) : (current + dir + els.length) % els.length
    this.select([els[next].id])
  }

  // ---- text editing -------------------------------------------------------------------

  /** Edit a text box: mount the one live editor on it. */
  startEditing(id: string, caret: CanvasController['pendingCaret'] = 'end') {
    const el = this.elements().find((e) => e.id === id)
    if (!el || el.type !== 'text') return
    if (this.state.editingId === id) return
    this.finishEditing()
    this.pendingCaret = caret
    this.editStart = el.content
    this.set({ selected: [id], editingId: id })
  }

  /** Called by the editor component once its editor exists (or is gone). */
  attachEditor(editor: Editor | null) {
    if (editor === this.state.editor) return
    this.set({ editor })
    if (!editor) return
    const caret = this.pendingCaret
    this.pendingCaret = null
    if (caret === 'all') editor.commands.selectAll()
    else if (caret && typeof caret === 'object' && 'x' in caret) {
      const pos = editor.view.posAtCoords({ left: caret.x, top: caret.y })
      if (pos) editor.commands.setTextSelection(pos.pos)
      else editor.commands.focus('end')
    } else editor.commands.focus('end')
    editor.view.focus() // now, not a frame later: keys typed next must land in the box
    if (caret && typeof caret === 'object' && 'char' in caret) this.pendingText = caret.char + this.pendingText
    if (this.pendingText) {
      editor.commands.insertContent(this.pendingText)
      this.pendingText = ''
    }
  }

  /**
   * A key typed while a text box is being edited but before its editor has the keyboard (the
   * moment right after Text box or a click): it goes into the box, never lost.
   */
  typeIntoEditing(text: string) {
    const editor = this.state.editor
    if (!this.state.editingId) return false
    if (editor && !editor.isDestroyed) {
      editor.view.focus()
      editor.commands.insertContent(text)
    } else this.pendingText += text
    return true
  }
  private pendingText = ''

  /** Stop editing; the text goes into the deck as one undo step (if it changed). */
  finishEditing() {
    const { editingId, editor } = this.state
    if (!editingId) return
    if (editor && !editor.isDestroyed) {
      const json = editor.getJSON()
      if (JSON.stringify(json) !== JSON.stringify(this.editStart) && !this.sameText(json)) {
        this.session.update((deck) => {
          const el = deck.slides.find((s) => s.id === this.session.getState().slideId)?.elements.find((e) => e.id === editingId)
          if (el && el.type === 'text') el.content = json as typeof el.content
        })
      }
    }
    this.dropEditor()
  }

  /** The editor adds default attributes (textAlign: null...) that change nothing on screen. */
  private sameText(json: unknown) {
    const strip = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(strip)
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, val] of Object.entries(v)) {
          if (k === 'attrs') {
            const kept = Object.fromEntries(Object.entries(val as object).filter(([, x]) => x !== null))
            if (Object.keys(kept).length) out.attrs = kept
          } else out[k] = strip(val)
        }
        return out
      }
      return v
    }
    return JSON.stringify(strip(json)) === JSON.stringify(strip(this.editStart))
  }

  private dropEditor() {
    this.editStart = null
    this.pendingCaret = null
    this.pendingText = ''
    this.set({ editingId: null, editor: null })
  }

  // ---- changes to elements ------------------------------------------------------------

  /** Change the selected elements on the current slide. */
  private updateSelected(fn: (el: Element) => void) {
    const sel = new Set(this.state.selected)
    this.session.update((deck) => {
      const slide = deck.slides.find((s) => s.id === this.session.getState().slideId)
      slide?.elements.forEach((el) => sel.has(el.id) && fn(el as Element))
    })
  }

  deleteSelected() {
    if (!this.state.selected.length) return
    this.finishEditing()
    const sel = new Set(this.state.selected)
    this.session.update((deck) => {
      const slide = deck.slides.find((s) => s.id === this.session.getState().slideId)
      if (slide) slide.elements = slide.elements.filter((e) => !sel.has(e.id))
    })
    this.set({ selected: [] })
  }

  /** Arrow keys: move by 1 unit (10 with Shift). A run of nudges is one undo step. */
  nudge(dx: number, dy: number) {
    if (!this.state.selected.length || this.state.editingId) return
    this.session.beginGesture()
    this.updateSelected((el) => {
      el.x = round(el.x + dx)
      el.y = round(el.y + dy)
    })
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer)
    this.nudgeTimer = setTimeout(() => this.endNudges(), NUDGE_MERGE_MS)
  }
  /** Close a run of nudges now (before undo, or any other change). */
  endNudges() {
    if (!this.nudgeTimer) return
    clearTimeout(this.nudgeTimer)
    this.nudgeTimer = null
    this.session.endGesture()
  }

  /** Drag: the boxes of the selection when the drag began. */
  dragStart() {
    this.endNudges()
    const els = this.selectedElements()
    return { ids: els.map((e) => e.id), boxes: new Map(els.map((e) => [e.id, { x: e.x, y: e.y, w: e.w, h: e.h }])) }
  }

  /** Move the selection by (dx, dy) from where the drag began, snapping to the slide. */
  dragTo(start: { boxes: Map<string, Box> }, dx: number, dy: number, threshold: number, snap: boolean) {
    const size = this.session.getState().deck.size
    const sel = bounds([...start.boxes.values()])
    const s = snap ? snapMove(sel, dx, dy, size, threshold) : { dx, dy, guides: { x: [], y: [] } }
    this.session.beginGesture()
    this.updateSelected((el) => {
      const b = start.boxes.get(el.id)
      if (!b) return
      el.x = round(b.x + s.dx)
      el.y = round(b.y + s.dy)
    })
    this.set({ guides: s.guides.x.length || s.guides.y.length ? s.guides : null })
  }

  /** Resize one element to a new box (the geometry is worked out by the canvas). Lines also take their direction. */
  resizeTo(id: string, b: Box & { flipH?: boolean; flipV?: boolean }, guides: Guides) {
    this.session.beginGesture()
    this.session.update((deck) => {
      const el = deck.slides.find((s) => s.id === this.session.getState().slideId)?.elements.find((e) => e.id === id)
      if (el) Object.assign(el, b)
    })
    this.set({ guides: guides.x.length || guides.y.length ? guides : null })
  }

  endDrag() {
    this.session.endGesture()
    if (this.state.guides) this.set({ guides: null })
  }
  cancelDrag() {
    this.session.cancelGesture()
    if (this.state.guides) this.set({ guides: null })
  }

  // ---- pictures, shapes, arranging ------------------------------------------------------

  /**
   * Shrink a picture to at most 1920 px on its long side, store it once in the deck, and place
   * it fitted inside the slide: centered, or around a drop point. Throws if it isn't a picture.
   */
  async insertPicture(file: File, at?: { x: number; y: number }) {
    this.finishEditing()
    const slideId = this.session.getState().slideId
    const { blob, width, height } = await shrinkImage(file, MAX_PICTURE_EDGE, { stillGif: true })
    const src = await this.session.addPicture(blob)
    const { width: W, height: H } = this.session.getState().deck.size
    const fit = Math.min(1, (W * PICTURE_FIT) / width, (H * PICTURE_FIT) / height)
    const w = Math.max(MIN_SIZE, round(width * fit))
    const h = Math.max(MIN_SIZE, round(height * fit))
    const cx = at ? at.x : W / 2
    const cy = at ? at.y : H / 2
    const el = {
      id: newId('e'),
      type: 'image' as const,
      x: round(Math.min(Math.max(cx - w / 2, 0), W - w)),
      y: round(Math.min(Math.max(cy - h / 2, 0), H - h)),
      w,
      h,
      src,
      alt: '',
    }
    this.session.update((deck) => {
      deck.slides.find((s) => s.id === slideId)?.elements.push(el)
    })
    if (this.session.getState().slideId === slideId) this.set({ selected: [el.id] })
    return el.id
  }

  /** Add a shape in the middle of the slide, in theme colors, and select it. */
  insertShape(shape: ShapeKind) {
    this.finishEditing()
    const { width: W, height: H } = this.session.getState().deck.size
    const line = shape === 'line' || shape === 'arrow'
    const w = shape === 'triangle' ? 240 : 320
    const h = line ? 0 : 200
    const el = {
      id: newId('e'),
      type: 'shape' as const,
      shape,
      x: round((W - w) / 2),
      y: round((H - h) / 2),
      w,
      h,
      fill: line ? null : ('accent1' as const),
      stroke: line ? ('text' as const) : null,
      strokeWidth: line ? 4 : 2,
    }
    this.session.update((deck) => {
      deck.slides.find((s) => s.id === this.session.getState().slideId)?.elements.push(el)
    })
    this.set({ selected: [el.id] })
  }

  /** Fill, outline color or outline width of the selected shapes. One undo step. */
  setShapeStyle(patch: { fill?: Color; stroke?: Color; strokeWidth?: number }) {
    this.updateSelected((el) => {
      if (el.type !== 'shape') return
      if ('fill' in patch && el.shape !== 'line' && el.shape !== 'arrow') el.fill = patch.fill ?? null
      if ('stroke' in patch) el.stroke = patch.stroke ?? null
      if (patch.strokeWidth !== undefined) el.strokeWidth = patch.strokeWidth
    })
  }

  /** Alt text of a picture (read aloud by screen readers, kept in the file). */
  setAlt(id: string, alt: string) {
    this.session.update((deck) => {
      const el = deck.slides.find((s) => s.id === this.session.getState().slideId)?.elements.find((e) => e.id === id)
      if (el && (el.type === 'image' || el.type === 'chart')) el.alt = alt.trim()
    })
  }

  /** Align the selection: one item to the slide, several to each other. One undo step. */
  alignSelected(kind: AlignKind) {
    this.finishEditing()
    this.movePositions(align(this.selectedElements(), kind, this.session.getState().deck.size))
  }

  /** Equal spacing between three or more selected items. One undo step. */
  distributeSelected(axis: 'horizontal' | 'vertical') {
    this.finishEditing()
    this.movePositions(distribute(this.selectedElements(), axis))
  }

  private movePositions(moves: Map<string, { x: number; y: number }>) {
    if (!moves.size) return
    this.updateSelected((el) => {
      const m = moves.get(el.id)
      if (m) Object.assign(el, m)
    })
  }

  /** Bring forward, send backward, to front or to back. One undo step. */
  restackSelected(move: StackMove) {
    if (!this.state.selected.length) return
    this.finishEditing()
    const sel = new Set(this.state.selected)
    const slideId = this.session.getState().slideId
    const now = this.session.currentSlide().elements
    const next = restack(now, sel, move)
    if (next.every((e, i) => e === now[i])) return
    this.session.update((deck) => {
      const slide = deck.slides.find((s) => s.id === slideId)
      if (!slide) return
      const byId = new Map(slide.elements.map((e) => [e.id, e]))
      slide.elements = next.map((e) => byId.get(e.id)!)
    })
  }

  /** Select everything whose box overlaps a rectangle drawn on the slide. */
  selectInRect(r: Box, add: boolean) {
    const hits = this.elements()
      .filter((e) => e.x < r.x + r.w && e.x + Math.max(e.w, 1) > r.x && e.y < r.y + r.h && e.y + Math.max(e.h, 1) > r.y)
      .map((e) => e.id)
    this.select(add ? [...new Set([...this.state.selected, ...hits])] : hits)
  }

  setVerticalAlign(v: 'top' | 'middle' | 'bottom') {
    this.updateSelected((el) => {
      if (el.type === 'text') el.verticalAlign = v
    })
  }

  // ---- inserting ----------------------------------------------------------------------

  insertTextBox() {
    this.finishEditing()
    const box = textBox()
    this.session.update((deck) => {
      deck.slides.find((s) => s.id === this.session.getState().slideId)?.elements.push(box)
    })
    this.startEditing(box.id)
  }

  // ---- clipboard (inside the app) -----------------------------------------------------

  copy() {
    const els = this.selectedElements()
    if (!els.length) return
    const media: Media = new Map()
    const all = this.session.getMedia()
    for (const el of els) if (el.type === 'image' && all.has(el.src)) media.set(el.src, all.get(el.src)!)
    this.clip = { elements: structuredClone(els), media }
    this.pasteCount = 0
  }
  cut() {
    this.copy()
    this.deleteSelected()
  }
  paste() {
    if (!this.clip) return
    this.finishEditing()
    this.pasteCount++
    const off = PASTE_OFFSET * this.pasteCount
    for (const [path, blob] of this.clip.media) if (!this.session.getMedia().has(path)) this.session.getMedia().set(path, blob)
    const copies = this.clip.elements.map((e) => ({ ...structuredClone(e), id: newId('e'), x: e.x + off, y: e.y + off }))
    this.session.update((deck) => {
      deck.slides.find((s) => s.id === this.session.getState().slideId)?.elements.push(...copies)
    })
    this.set({ selected: copies.map((c) => c.id) })
  }
  /** Ctrl+D with elements selected: copies right on top, offset a little. */
  duplicate() {
    if (!this.state.selected.length) return
    const saved = this.clip
    const savedCount = this.pasteCount
    this.copy()
    this.paste()
    this.clip = saved
    this.pasteCount = savedCount
  }

  // ---- slides -------------------------------------------------------------------------

  /** Add a slide after the current one and go to it. */
  /** A new slide after the current one: in this layout, or else the current slide's (Title and content after a title slide). */
  addSlide(layoutId?: string) {
    this.finishEditing()
    const current = this.session.currentSlide().layout
    const slide = slideWithLayout(layoutId ?? (current === 'title' || !layoutById(current) ? 'title-content' : current))
    const at = this.session.getState().slideId
    this.session.update((deck) => {
      const i = deck.slides.findIndex((s) => s.id === at)
      deck.slides.splice(i + 1, 0, slide)
    })
    this.session.goTo(slide.id)
  }

  /** Delete a slide. The last one stays: a deck always has a slide. */
  /** Rearrange the current slide for another layout. One undo step; typed text is never lost. */
  setLayout(layoutId: string) {
    this.finishEditing()
    const id = this.session.getState().slideId
    this.session.update((deck) => {
      const i = deck.slides.findIndex((s) => s.id === id)
      if (i >= 0) deck.slides[i] = applyLayout(deck.slides[i] as Slide, layoutId)
    })
    this.set({ selected: [] })
  }

  /** Restyle the whole deck. One undo step. */
  setTheme(themeId: string) {
    this.finishEditing()
    this.session.update((deck) => {
      deck.theme = themeForDeck(themeId)
    })
  }

  /** The current slide's background: a color, or null for the theme's. One undo step. */
  setBackground(color: Color) {
    const id = this.session.getState().slideId
    this.session.update((deck) => {
      const slide = deck.slides.find((s) => s.id === id)
      if (slide) slide.background = color
    })
  }

  deleteSlide(id: string) {
    const slides = this.session.getState().deck.slides
    if (slides.length <= 1) return
    this.finishEditing()
    const i = slides.findIndex((s) => s.id === id)
    if (i < 0) return
    const next = slides[i + 1] ?? slides[i - 1]
    const wasCurrent = this.session.getState().slideId === id
    this.session.update((deck) => {
      deck.slides.splice(i, 1)
    })
    if (wasCurrent) this.session.goTo(next.id)
  }

  /** Previous and next slide (Page Up, Page Down). */
  step(dir: 1 | -1) {
    const { deck, slideId } = this.session.getState()
    const i = deck.slides.findIndex((s) => s.id === slideId)
    const next = deck.slides[i + dir]
    if (next) {
      this.finishEditing()
      this.session.goTo(next.id)
    }
  }

  goTo(slideId: string) {
    this.finishEditing()
    this.session.goTo(slideId)
  }

  undo() {
    this.endNudges()
    this.finishEditing()
    this.session.undo()
  }
  redo() {
    this.endNudges()
    this.finishEditing()
    this.session.redo()
  }
}
