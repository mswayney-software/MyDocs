import { round, type Box } from './geometry'

export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type StackMove = 'forward' | 'backward' | 'front' | 'back'

interface Item extends Box {
  id: string
}

/**
 * New positions for aligned items. One item aligns to the slide; several align to the box
 * around them all (as in every slide app). Returns only the positions that change.
 */
export function align(items: Item[], kind: AlignKind, slide: { width: number; height: number }): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (!items.length) return out
  const area =
    items.length === 1
      ? { x: 0, y: 0, w: slide.width, h: slide.height }
      : (() => {
          const x = Math.min(...items.map((i) => i.x))
          const y = Math.min(...items.map((i) => i.y))
          return {
            x,
            y,
            w: Math.max(...items.map((i) => i.x + i.w)) - x,
            h: Math.max(...items.map((i) => i.y + i.h)) - y,
          }
        })()
  for (const i of items) {
    let { x, y } = i
    if (kind === 'left') x = area.x
    else if (kind === 'center') x = area.x + (area.w - i.w) / 2
    else if (kind === 'right') x = area.x + area.w - i.w
    else if (kind === 'top') y = area.y
    else if (kind === 'middle') y = area.y + (area.h - i.h) / 2
    else y = area.y + area.h - i.h
    x = round(x)
    y = round(y)
    if (x !== i.x || y !== i.y) out.set(i.id, { x, y })
  }
  return out
}

/**
 * Equal gaps between three or more items, across ("horizontal") or down ("vertical"). The two
 * outermost items stay put. Returns only the positions that change.
 */
export function distribute(items: Item[], axis: 'horizontal' | 'vertical'): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  if (items.length < 3) return out
  const pos = axis === 'horizontal' ? 'x' : 'y'
  const size = axis === 'horizontal' ? 'w' : 'h'
  const sorted = [...items].sort((a, b) => a[pos] - b[pos] || a.id.localeCompare(b.id))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const total = sorted.reduce((sum, i) => sum + i[size], 0)
  const gap = (last[pos] + last[size] - first[pos] - total) / (sorted.length - 1)
  let at = first[pos]
  for (const i of sorted) {
    const p = round(at)
    if (p !== i[pos]) out.set(i.id, { x: pos === 'x' ? p : i.x, y: pos === 'y' ? p : i.y })
    at += i[size] + gap
  }
  return out
}

/**
 * The drawing order after a stacking move (later = on top). Forward and backward move each
 * selected item one step past its nearest unselected neighbor; the selection keeps its own order.
 */
export function restack<T extends { id: string }>(elements: T[], selected: ReadonlySet<string>, move: StackMove): T[] {
  const picked = elements.filter((e) => selected.has(e.id))
  const others = elements.filter((e) => !selected.has(e.id))
  if (!picked.length) return elements
  if (move === 'front') return [...others, ...picked]
  if (move === 'back') return [...picked, ...others]
  const list = [...elements]
  if (move === 'forward') {
    for (let i = list.length - 2; i >= 0; i--) {
      if (selected.has(list[i].id) && !selected.has(list[i + 1].id)) [list[i], list[i + 1]] = [list[i + 1], list[i]]
    }
  } else {
    for (let i = 1; i < list.length; i++) {
      if (selected.has(list[i].id) && !selected.has(list[i - 1].id)) [list[i], list[i - 1]] = [list[i - 1], list[i]]
    }
  }
  return list
}
