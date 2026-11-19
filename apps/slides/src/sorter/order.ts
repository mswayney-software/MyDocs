import type { Slide } from '../deck/schema'
import { newId } from '../deck/newId'

/**
 * Slide order and grid geometry, without the DOM: the strip (one column) and the sorter
 * (several) share them. Every thumbnail is the same size, so positions are worked out from
 * the index alone. That is what lets both lists draw only the thumbnails on screen.
 */

/**
 * Move the chosen slides, keeping their order, into a gap of the list as it is now: gap 0 is
 * before the first slide, gap n after the last. Chosen slides that weren't together end up together.
 */
export function moveToGap<T extends { id: string }>(list: readonly T[], chosen: ReadonlySet<string>, gap: number): T[] {
  const at = Math.max(0, Math.min(list.length, gap))
  const before = list.slice(0, at).filter((s) => !chosen.has(s.id))
  const after = list.slice(at).filter((s) => !chosen.has(s.id))
  return [...before, ...list.filter((s) => chosen.has(s.id)), ...after]
}

/** The gap a keyboard move of `delta` places lands in (negative: earlier). */
export function gapForStep(list: readonly { id: string }[], chosen: ReadonlySet<string>, delta: number): number {
  const picked = list.flatMap((s, i) => (chosen.has(s.id) ? [i] : []))
  if (!picked.length) return -1
  return delta < 0 ? Math.max(0, picked[0] + delta) : Math.min(list.length, picked.at(-1)! + 1 + delta)
}

/** True when moving into this gap would change nothing. */
export function sameOrder(a: readonly { id: string }[], b: readonly { id: string }[]) {
  return a.length === b.length && a.every((s, i) => s.id === b[i].id)
}

/** A copy of a slide with fresh ids for it and everything on it. Pictures are shared, not copied. */
export function copySlide(slide: Slide): Slide {
  const copy = structuredClone(slide)
  copy.id = newId('s')
  for (const el of copy.elements) el.id = newId('e')
  return copy
}

/** The slides from one to another, in deck order, whichever comes first. */
export function rangeIds(list: readonly { id: string }[], from: string, to: string): string[] {
  const a = list.findIndex((s) => s.id === from)
  const b = list.findIndex((s) => s.id === to)
  if (a < 0 || b < 0) return b >= 0 ? [to] : []
  const [lo, hi] = a < b ? [a, b] : [b, a]
  return list.slice(lo, hi + 1).map((s) => s.id)
}

// ---- grid geometry -----------------------------------------------------------------------

export interface Grid {
  count: number
  cols: number
  /** One cell, including the space after it. */
  cellW: number
  cellH: number
  /** Space before the first cell. */
  padX: number
  padY: number
}

export const rows = (g: Grid) => Math.ceil(g.count / g.cols)
export const cellAt = (g: Grid, i: number) => ({ x: g.padX + (i % g.cols) * g.cellW, y: g.padY + Math.floor(i / g.cols) * g.cellH })
/** Height of the whole list, for its scroll area. */
export const contentHeight = (g: Grid) => g.padY * 2 + rows(g) * g.cellH

/** How many cells of this width fit across. Never fewer than one. */
export const columnsFor = (width: number, cellW: number, padX: number) => Math.max(1, Math.floor((width - padX * 2) / cellW))

/** Slides to draw for this scroll position: the rows on screen, plus a few each side. */
export function visibleRange(g: Grid, scrollTop: number, viewHeight: number, overscanRows = 2): [number, number] {
  const first = Math.max(0, Math.floor((scrollTop - g.padY) / g.cellH) - overscanRows)
  const last = Math.ceil((scrollTop + viewHeight - g.padY) / g.cellH) + overscanRows
  return [Math.min(g.count, first * g.cols), Math.min(g.count, last * g.cols)]
}

/**
 * The gap a drag dropped at this point (content coordinates) lands in, and where to draw the
 * marker: the row, and the column the marker sits before (cols = after the row's last cell).
 */
export function gapAt(g: Grid, x: number, y: number): { gap: number; row: number; col: number } {
  if (g.cols === 1) {
    const gap = clamp(Math.round((y - g.padY) / g.cellH), 0, g.count)
    return { gap, row: gap, col: 0 }
  }
  const lastRow = Math.max(0, rows(g) - 1)
  const row = clamp(Math.floor((y - g.padY) / g.cellH), 0, lastRow)
  const inRow = row === lastRow ? g.count - row * g.cols : g.cols
  const col = clamp(Math.round((x - g.padX) / g.cellW), 0, inRow)
  return { gap: row * g.cols + col, row, col }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
