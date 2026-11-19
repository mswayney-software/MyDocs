import type { Editor } from '@tiptap/core'
import { newId, textBox } from '../deck/defaults'
import { applyLayout, layoutById, slideWithLayout } from '../deck/layouts'
import type { Media } from '../deck/media'
import { LIMITS, type ChartElement, type Color, type Element, type SHAPES, type Slide, type TableElement, type Transition } from '../deck/schema'
import { themeForDeck } from '../deck/themes'
import type { DeckSession } from '../deck/session'
import { shrinkImage } from '@mysuite/core/images'
import { docToGrid, emptyGrid, fitWidths } from '../elements/table-doc'
import { copySlide, gapForStep, moveToGap, rangeIds, sameOrder } from '../sorter/order'
import { align, distribute, restack, type AlignKind, type StackMove } from './arrange'
import { bounds, MIN_SIZE, round, snapMove, type Box, type Guides } from './geometry'

export interface UiState {
  /** Selected elements on the current slide. */
  selected: string[]
  /** The text box or table being edited live; null when none. */
  editingId: string | null
  /** Alignment guides to draw during a drag. */
  guides: Guides | null
  /** The live editor while a text box is being edited. */
  editor: Editor | null
  /**
   * Slides picked in the strip or the sorter, in deck order. Always holds the current slide:
   * slide actions (duplicate, delete, move) act on these.
   */
  slides: string[]
  /**
   * The chart data window, while open: for the chart with this id, or for a new chart (null).
   * Nothing is in the deck until Apply.
   */
  chart: { id: string | null } | null
}

/** A chart's data and settings: what the chart data window edits. */
export type ChartEdit = Pick<ChartElement, 'chartType' | 'title' | 'alt' | 'categories' | 'series' | 'options'>

/** What a new chart starts with, ready to be typed over. */
export const SAMPLE_CHART: ChartEdit = {
  chartType: 'bar',
  title: '',
  alt: '',
  categories: ['Group 1', 'Group 2', 'Group 3'],
  series: [
    { name: 'Series 1', values: [4, 7, 5] },
    { name: 'Series 2', values: [3, 5, 8] },
  ],
  options: { legend: true, xTitle: '', yTitle: '' },
}

/** Pictures are stored at most this many pixels on their long side (spec, decision 5). */
export const MAX_PICTURE_EDGE = 1920
/** A new picture fits inside this share of the slide. */
const PICTURE_FIT = 0.6

type ShapeKind = (typeof SHAPES)[number]

/** Consecutive arrow-key nudges within this long are one undo step. */
const NUDGE_MERGE_MS = 700
/** Typing in the notes with pauses shorter than this is one undo step. */
export const NOTES_MERGE_MS = 1000
/** Each paste lands this far from the last, so copies don't hide each other. */
const PASTE_OFFSET = 20
/** A table column is never narrower than this (slide units). */
export const MIN_COLUMN = 40
/** Height of a new table's rows, slide units. */
const NEW_ROW_H = 40

/** The editor adds default attributes (textAlign: null...) that change nothing on screen. */
function stripDefaults(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripDefaults)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      if (k === 'attrs') {
        const kept = Object.fromEntries(Object.entries(val as object).filter(([, x]) => x !== null))
        if (Object.keys(kept).length) out.attrs = kept
      } else out[k] = stripDefaults(val)
    }
    return out
  }
  return v
}
const sameContent = (a: unknown, b: unknown) => JSON.stringify(stripDefaults(a)) === JSON.stringify(stripDefaults(b))

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
  private state: UiState
  private notesTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<() => void>()
  private clip: Clip | null = null
  private pasteCount = 0
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null
  private lastSlideId: string
  /** What the editor started with, to tell whether anything changed. */
  private editStart: unknown = null
  /** Where to put the caret once the editor exists: a click point, or a character typed to start. */
  private pendingCaret: { x: number; y: number } | { char: string } | 'start' | 'end' | 'all' | null = null
  /** The live table's natural height in slide units (set by the table editor while it exists). */
  private measureTable: (() => number) | null = null
  readonly session: DeckSession

  constructor(session: DeckSession) {
    this.session = session
    this.lastSlideId = session.getState().slideId
    this.state = { selected: [], editingId: null, guides: null, editor: null, slides: [this.lastSlideId], chart: null }
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
    // Picked slides: only ones still in the deck, in deck order, and always the current one.
    const picked = new Set(this.state.slides)
    const slides = s.deck.slides.filter((x) => picked.has(x.id)).map((x) => x.id)
    const keptSlides = slides.includes(s.slideId) ? slides : [s.slideId]
    if (!sameIds(keptSlides, this.state.slides)) this.set({ slides: keptSlides })
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
  /**
   * Tab and Shift+Tab: the next element in drawing order. Past the last one (or before the first)
   * the selection clears and this returns false, so the key moves on to the next control: the
   * slide is never a keyboard trap.
   */
  cycle(dir: 1 | -1): boolean {
    const els = this.elements()
    const current = els.findIndex((e) => e.id === this.state.selected.at(-1))
    const next = current < 0 ? (dir > 0 ? 0 : els.length - 1) : current + dir
    if (!els.length || next < 0 || next >= els.length) {
      this.clearSelection()
      return false
    }
    this.select([els[next].id])
    return true
  }

  // ---- text editing -------------------------------------------------------------------

  /** Edit a text box or a table's cells: mount the one live editor on it. */
  startEditing(id: string, caret: CanvasController['pendingCaret'] = 'end') {
    const el = this.elements().find((e) => e.id === id)
    if (!el || (el.type !== 'text' && el.type !== 'table')) return
    if (this.state.editingId === id) return
    this.finishEditing()
    this.pendingCaret = caret
    this.editStart = el.type === 'text' ? el.content : { headerRow: el.headerRow, columnWidths: el.columnWidths, rows: el.rows }
    this.set({ selected: [id], editingId: id })
  }

  /** Called by the editor component once its editor exists (or is gone). */
  attachEditor(editor: Editor | null) {
    if (editor === this.state.editor) return
    this.state.editor?.off('update', this.onLiveUpdate)
    this.set({ editor })
    if (!editor) {
      this.session.setLiveEdit(null)
      return
    }
    // What is typed is backed up as it is typed, not only when the box is left: a crash
    // mid-paragraph loses at most a second (spec, Reliability).
    editor.on('update', this.onLiveUpdate)
    this.session.setLiveEdit(() => this.deckWithLiveEdit())
    const caret = this.pendingCaret
    this.pendingCaret = null
    if (caret === 'all') editor.commands.selectAll()
    else if (caret === 'start') editor.commands.focus('start')
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
    this.endNotes()
    const { editingId, editor } = this.state
    if (!editingId) return
    const editingEl = this.elements().find((e) => e.id === editingId)
    if (editingEl?.type === 'table') {
      this.finishTable(editingEl)
      return
    }
    if (editor && !editor.isDestroyed) {
      const json = editor.getJSON()
      if (JSON.stringify(json) !== JSON.stringify(this.editStart) && !sameContent(json, this.editStart)) {
        this.session.update((deck) => {
          const el = deck.slides.find((s) => s.id === this.session.getState().slideId)?.elements.find((e) => e.id === editingId)
          if (el && el.type === 'text') el.content = json as typeof el.content
        })
      }
    }
    this.dropEditor()
  }

  /**
   * Stop editing a table: its cells go into the deck as one undo step. The table grows to fit its
   * text, and fits its rows again when rows were added or removed.
   */
  private finishTable(el: TableElement) {
    const editor = this.state.editor
    if (editor && !editor.isDestroyed) {
      const grid = docToGrid(editor.getJSON(), el.w)
      const natural = this.measureTable?.() ?? el.h
      const rowsChanged = grid !== null && grid.rows.length !== el.rows.length
      const h = Math.round(rowsChanged ? natural : Math.max(el.h, natural))
      if (grid && (!sameContent(grid, this.editStart) || h !== el.h)) {
        const slideId = this.session.getState().slideId
        this.session.update((deck) => {
          const t = deck.slides.find((s) => s.id === slideId)?.elements.find((e) => e.id === el.id)
          // Stored without the editor's empty settings, so deck.json stays plain.
          if (t?.type === 'table') Object.assign(t, stripDefaults(grid), { h })
        })
      }
    }
    this.dropEditor()
  }

  /** Called by the table editor: how tall its table is with nothing stretching it. */
  attachTableMeasure(measure: (() => number) | null) {
    this.measureTable = measure
  }

  private onLiveUpdate = () => this.session.touchLiveEdit()

  /** The deck as it would be if the box or table being edited were finished now. */
  private deckWithLiveEdit() {
    const deck = this.session.getState().deck
    const { editingId, editor } = this.state
    if (!editingId || !editor || editor.isDestroyed) return deck
    const slideId = this.session.getState().slideId
    return {
      ...deck,
      slides: deck.slides.map((s) =>
        s.id !== slideId
          ? s
          : {
              ...s,
              elements: s.elements.map((el) => {
                if (el.id !== editingId) return el
                if (el.type === 'text') return { ...el, content: stripDefaults(editor.getJSON()) as typeof el.content }
                if (el.type === 'table') {
                  const grid = docToGrid(editor.getJSON(), el.w)
                  return grid ? { ...el, ...(stripDefaults(grid) as typeof grid) } : el
                }
                return el
              }),
            },
      ),
    }
  }

  private dropEditor() {
    this.state.editor?.off('update', this.onLiveUpdate)
    this.session.setLiveEdit(null)
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
  /**
   * Ctrl+Shift+arrows: make the selection wider or narrower, taller or shorter, from its top left
   * corner (spec, Accessibility: resizing with the keyboard). Pictures keep their proportions; a
   * table's columns stretch with it. A run of presses is one undo step, like nudges.
   */
  resizeBy(dw: number, dh: number) {
    if (!this.state.selected.length || this.state.editingId) return
    this.session.beginGesture()
    this.updateSelected((el) => {
      const line = el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow')
      let w = Math.max(MIN_SIZE, el.w + dw)
      let h = Math.max(line ? 0 : MIN_SIZE, el.h + dh)
      if (el.type === 'image' && el.w > 0 && el.h > 0) {
        if (dw) h = Math.max(MIN_SIZE, (w * el.h) / el.w)
        else w = Math.max(MIN_SIZE, (h * el.w) / el.h)
      }
      if (el.type === 'table' && w !== el.w) el.columnWidths = fitWidths(el.columnWidths, round(w))
      el.w = round(w)
      el.h = round(h)
    })
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer)
    this.nudgeTimer = setTimeout(() => this.endNudges(), NUDGE_MERGE_MS)
  }

  /** Place one element exactly (Size and position…). One undo step. */
  setBox(id: string, box: Box) {
    this.endNudges()
    const slideId = this.session.getState().slideId
    this.session.update((deck) => {
      const el = deck.slides.find((s) => s.id === slideId)?.elements.find((e) => e.id === id)
      if (!el) return
      const line = el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow')
      const w = round(Math.max(MIN_SIZE, box.w))
      if (el.type === 'table' && w !== el.w) el.columnWidths = fitWidths(el.columnWidths, w)
      el.x = round(box.x)
      el.y = round(box.y)
      el.w = w
      el.h = round(Math.max(line ? 0 : MIN_SIZE, box.h))
    })
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
    this.endNotes()
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
      // A table's columns stretch with it.
      if (el?.type === 'table' && b.w !== el.w) el.columnWidths = fitWidths(el.columnWidths, b.w)
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

  // ---- tables -------------------------------------------------------------------------

  /** Add an empty table in the middle of the slide, with a header row, and start typing in it. */
  insertTable(rows: number, cols: number) {
    this.finishEditing()
    rows = Math.max(1, Math.min(LIMITS.tableRows, Math.round(rows)))
    cols = Math.max(1, Math.min(LIMITS.tableColumns, Math.round(cols)))
    const { width: W, height: H } = this.session.getState().deck.size
    const w = Math.min(1120, cols * 180)
    const h = Math.min(H - 80, rows * NEW_ROW_H)
    const el: TableElement = { id: newId('e'), type: 'table', x: round((W - w) / 2), y: round(Math.max(40, (H - h) / 2)), w, h, ...emptyGrid(rows, cols, w) }
    this.session.update((deck) => {
      deck.slides.find((s) => s.id === this.session.getState().slideId)?.elements.push(el)
    })
    this.set({ selected: [el.id] })
    this.startEditing(el.id, 'start')
  }

  /**
   * Drag a column's right edge: that column and the next share their width, so the table keeps
   * its own. Part of a gesture (one undo step per drag).
   */
  setColumnEdge(id: string, index: number, width: number) {
    this.session.beginGesture()
    const slideId = this.session.getState().slideId
    this.session.update((deck) => {
      const t = deck.slides.find((s) => s.id === slideId)?.elements.find((e) => e.id === id)
      if (t?.type !== 'table' || index < 0 || index >= t.columnWidths.length - 1) return
      const widths = fitWidths(t.columnWidths, t.w)
      const pair = widths[index] + widths[index + 1]
      const left = round(Math.max(MIN_COLUMN, Math.min(pair - MIN_COLUMN, width)))
      widths[index] = left
      widths[index + 1] = round(pair - left)
      t.columnWidths = widths
    })
  }

  // ---- charts -------------------------------------------------------------------------

  /** Open the chart data window: for a chart on this slide, or (no id) for a new one. */
  openChart(id?: string) {
    this.finishEditing()
    const el = id ? this.elements().find((e) => e.id === id) : undefined
    if (id && el?.type !== 'chart') return
    this.set({ chart: { id: id ?? null } })
  }

  closeChart() {
    if (this.state.chart) this.set({ chart: null })
  }

  /** The chart the data window is editing, or the sample for a new one. */
  chartToEdit(): ChartEdit {
    const id = this.state.chart?.id
    const el = id ? this.elements().find((e) => e.id === id) : undefined
    if (el?.type !== 'chart') return structuredClone(SAMPLE_CHART)
    const { chartType, title, alt, categories, series, options } = el
    return structuredClone({ chartType, title, alt, categories, series, options })
  }

  /** Apply in the chart data window: a new chart goes on the slide, an existing one redraws. One undo step. */
  applyChart(data: ChartEdit) {
    const target = this.state.chart
    if (!target) return
    const slideId = this.session.getState().slideId
    if (target.id) {
      const id = target.id
      this.session.update((deck) => {
        const el = deck.slides.find((s) => s.id === slideId)?.elements.find((e) => e.id === id)
        if (el?.type === 'chart') Object.assign(el, structuredClone(data))
      })
      this.set({ chart: null, selected: [id] })
      return
    }
    const { width: W, height: H } = this.session.getState().deck.size
    const w = 720
    const h = 440
    const el: ChartElement = { id: newId('e'), type: 'chart', x: round((W - w) / 2), y: round((H - h) / 2), w, h, ...structuredClone(data) }
    this.session.update((deck) => {
      deck.slides.find((s) => s.id === slideId)?.elements.push(el)
    })
    this.set({ chart: null, selected: [el.id] })
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
  /** Ctrl+D: copies of the selected elements, offset a little; with nothing selected, of the slide. */
  duplicate() {
    if (!this.state.selected.length) return this.duplicateSlides()
    const saved = this.clip
    const savedCount = this.pasteCount
    this.copy()
    this.paste()
    this.clip = saved
    this.pasteCount = savedCount
  }

  // ---- slides -------------------------------------------------------------------------

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

  /**
   * How slides appear when presenting: the picked slides, or every slide with `all`. One undo
   * step.
   */
  setTransition(kind: Transition, all = false) {
    const ids = new Set(all ? this.session.getState().deck.slides.map((s) => s.id) : this.state.slides)
    this.session.update((deck) => {
      for (const slide of deck.slides) if (ids.has(slide.id)) slide.transition = kind
    })
  }

  /** Delete one slide. */
  deleteSlide(id: string) {
    this.deleteSlides([id])
  }

  /**
   * Delete slides (the picked ones by default). One undo step. A deck always keeps a slide, so
   * deleting every slide leaves the first. The slide after the last deleted one opens.
   */
  deleteSlides(ids: string[] = this.state.slides) {
    const slides = this.session.getState().deck.slides
    const gone = new Set(ids)
    if (slides.every((s) => gone.has(s.id))) gone.delete(slides[0].id)
    if (!slides.some((s) => gone.has(s.id))) return
    this.finishEditing()
    const lastGone = slides.findLastIndex((s) => gone.has(s.id))
    const next =
      slides.slice(lastGone + 1).find((s) => !gone.has(s.id)) ?? slides.slice(0, lastGone).findLast((s) => !gone.has(s.id))!
    const current = this.session.getState().slideId
    this.session.update((deck) => {
      deck.slides = deck.slides.filter((s) => !gone.has(s.id))
    })
    if (gone.has(current)) this.session.goTo(next.id)
    this.set({ slides: [this.session.getState().slideId] })
  }

  /** Copies of the picked slides, placed after the last of them. One undo step; the copies are picked. */
  duplicateSlides(ids: string[] = this.state.slides) {
    this.finishEditing()
    const chosen = new Set(ids)
    const slides = this.session.getState().deck.slides
    const originals = slides.filter((s) => chosen.has(s.id))
    if (!originals.length) return
    const copies = originals.map(copySlide)
    const after = slides.findLastIndex((s) => chosen.has(s.id))
    this.session.update((deck) => {
      deck.slides.splice(after + 1, 0, ...copies)
    })
    this.session.goTo(copies[0].id)
    this.set({ slides: copies.map((c) => c.id) })
  }

  /** Move the picked slides into a gap of the deck (0 = before the first). One undo step. */
  moveSlides(gap: number, ids: string[] = this.state.slides) {
    this.finishEditing()
    const now = this.session.getState().deck.slides
    const next = moveToGap(now, new Set(ids), gap)
    if (sameOrder(now, next)) return false
    this.session.update((deck) => {
      const byId = new Map(deck.slides.map((s) => [s.id, s]))
      deck.slides = next.map((s) => byId.get(s.id)!)
    })
    return true
  }

  /** Keyboard move: `delta` places earlier (negative) or later; a whole row in the sorter. */
  moveSlidesBy(delta: number) {
    const gap = gapForStep(this.session.getState().deck.slides, new Set(this.state.slides), delta)
    return gap >= 0 && this.moveSlides(gap)
  }

  /** Where the picked slides start now, counting from 1. */
  slidePosition() {
    const picked = new Set(this.state.slides)
    return this.session.getState().deck.slides.findIndex((s) => picked.has(s.id)) + 1
  }

  // ---- picking slides (strip and sorter) ------------------------------------------------

  /** Open a slide and pick it alone. */
  openSlide(id: string) {
    this.goTo(id)
    this.set({ slides: [this.session.getState().slideId] })
  }

  /** Ctrl+click: add a slide to the picked ones or take it out (never the last one). */
  toggleSlide(id: string) {
    const picked = this.state.slides
    if (!picked.includes(id)) {
      this.goTo(id)
      this.set({ slides: this.inDeckOrder([...picked, id]) })
      return
    }
    if (picked.length === 1) return
    const rest = picked.filter((s) => s !== id)
    this.set({ slides: rest })
    if (this.session.getState().slideId === id) this.goTo(rest[0])
  }

  /** Shift+click or Shift+arrows: every slide from the anchor to this one. */
  pickSlideRange(anchor: string, to: string) {
    const range = rangeIds(this.session.getState().deck.slides, anchor, to)
    this.set({ slides: range })
    this.goTo(to)
  }

  pickAllSlides() {
    this.finishEditing()
    this.set({ slides: this.session.getState().deck.slides.map((s) => s.id) })
  }

  private inDeckOrder(ids: string[]) {
    const set = new Set(ids)
    return this.session.getState().deck.slides.filter((s) => set.has(s.id)).map((s) => s.id)
  }

  // ---- speaker notes ------------------------------------------------------------------

  /** Notes for the current slide. Typing with short pauses is one undo step. */
  editNotes(text: string) {
    const id = this.session.getState().slideId
    this.session.beginGesture()
    this.session.update((deck) => {
      const slide = deck.slides.find((s) => s.id === id)
      if (slide) slide.notes = text
    })
    if (this.notesTimer) clearTimeout(this.notesTimer)
    this.notesTimer = setTimeout(() => this.endNotes(), NOTES_MERGE_MS)
  }

  /** Close a run of typing in the notes now (leaving the box, undo, or any other action). */
  endNotes() {
    if (!this.notesTimer) return
    clearTimeout(this.notesTimer)
    this.notesTimer = null
    this.session.endGesture()
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
    this.endNotes()
    this.finishEditing()
    this.session.undo()
  }
  redo() {
    this.endNudges()
    this.endNotes()
    this.finishEditing()
    this.session.redo()
  }
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
