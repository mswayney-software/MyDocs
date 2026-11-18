/** Moving, resizing and snapping in slide units. Pure functions, tested on their own. */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Smallest box a resize can make, in slide units. Lines may be flat. */
export const MIN_SIZE = 16

/** Where guides are drawn: x positions of vertical lines, y positions of horizontal ones. */
export interface Guides {
  x: number[]
  y: number[]
}

/** The box around several boxes. */
export function bounds(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const r = Math.max(...boxes.map((b) => b.x + b.w))
  const btm = Math.max(...boxes.map((b) => b.y + b.h))
  return { x, y, w: r - x, h: btm - y }
}

/** Find the smallest shift (within `threshold`) that lines one of `edges` up with a target. */
function snapAxis(edges: number[], targets: number[], threshold: number): { shift: number; at: number[] } {
  let best: { shift: number; at: number[] } = { shift: 0, at: [] }
  let bestDist = threshold + 1e-9
  for (const e of edges) {
    for (const t of targets) {
      const d = Math.abs(t - e)
      if (d < bestDist - 1e-9) {
        bestDist = d
        best = { shift: t - e, at: [t] }
      } else if (Math.abs(d - bestDist) < 1e-9 && best.at.length && t - e === best.shift && !best.at.includes(t)) {
        best.at.push(t)
      }
    }
  }
  return best
}

/**
 * Move a selection by (dx, dy), snapping its edges or center to the slide's edges and center
 * when they come within `threshold` units. Returns the snapped shift and the guides to draw.
 */
export function snapMove(sel: Box, dx: number, dy: number, slide: { width: number; height: number }, threshold: number) {
  const x = sel.x + dx
  const y = sel.y + dy
  const sx = snapAxis([x, x + sel.w / 2, x + sel.w], [0, slide.width / 2, slide.width], threshold)
  const sy = snapAxis([y, y + sel.h / 2, y + sel.h], [0, slide.height / 2, slide.height], threshold)
  return { dx: dx + sx.shift, dy: dy + sy.shift, guides: { x: sx.at, y: sy.at } as Guides }
}

/**
 * Resize `b` by dragging `handle` by (dx, dy). Opposite edges stay put. With `keepRatio`
 * (Shift, or always for pictures) the box keeps its proportions. Moving edges snap to the
 * slide's edges and center.
 */
export function resizeBox(
  b: Box,
  handle: Handle,
  dx: number,
  dy: number,
  opts: { keepRatio?: boolean; slide?: { width: number; height: number }; threshold?: number; minH?: number } = {},
): { box: Box; guides: Guides } {
  const minW = MIN_SIZE
  const minH = opts.minH ?? MIN_SIZE
  let left = b.x
  let top = b.y
  let right = b.x + b.w
  let bottom = b.y + b.h
  const guides: Guides = { x: [], y: [] }
  const snapTo = (v: number, targets: number[], axis: 'x' | 'y') => {
    if (!opts.slide || !opts.threshold) return v
    for (const t of targets) {
      if (Math.abs(t - v) <= opts.threshold) {
        guides[axis].push(t)
        return t
      }
    }
    return v
  }
  const xs = opts.slide ? [0, opts.slide.width / 2, opts.slide.width] : []
  const ys = opts.slide ? [0, opts.slide.height / 2, opts.slide.height] : []

  if (handle.includes('w')) left = Math.min(snapTo(left + dx, xs, 'x'), right - minW)
  if (handle.includes('e')) right = Math.max(snapTo(right + dx, xs, 'x'), left + minW)
  if (handle.includes('n')) top = Math.min(snapTo(top + dy, ys, 'y'), bottom - minH)
  if (handle.includes('s')) bottom = Math.max(snapTo(bottom + dy, ys, 'y'), top + minH)

  if (opts.keepRatio && b.w > 0 && b.h > 0) {
    const ratio = b.w / b.h
    let w = right - left
    let h = bottom - top
    const corner = handle.length === 2
    if (corner) {
      // The edge that moved further, relative to the box, leads (growing or shrinking).
      if (Math.abs(w / b.w - 1) >= Math.abs(h / b.h - 1)) h = w / ratio
      else w = h * ratio
    } else if (handle === 'e' || handle === 'w') h = w / ratio
    else w = h * ratio
    w = Math.max(w, minW)
    h = Math.max(h, minH)
    if (handle.includes('w')) left = right - w
    else if (handle === 'n' || handle === 's') {
      const cx = b.x + b.w / 2
      left = cx - w / 2
    }
    right = left + w
    if (handle.includes('n')) top = bottom - h
    else if (handle === 'e' || handle === 'w') {
      const cy = b.y + b.h / 2
      top = cy - h / 2
    }
    bottom = top + h
    guides.x = []
    guides.y = []
  }
  return { box: { x: round(left), y: round(top), w: round(right - left), h: round(bottom - top) }, guides }
}

/** Slide units are stored with at most two decimals; files stay readable. */
export const round = (n: number) => Math.round(n * 100) / 100

/** Where a line or arrow starts and ends inside its box (see flipH and flipV in the format doc). */
export function lineEnds(el: { w: number; h: number; flipH?: boolean; flipV?: boolean }) {
  return {
    from: { x: el.flipH ? el.w : 0, y: el.flipV ? el.h : 0 },
    to: { x: el.flipH ? 0 : el.w, y: el.flipV ? 0 : el.h },
  }
}
