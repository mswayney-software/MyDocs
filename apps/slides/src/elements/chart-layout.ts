import type { ChartElement, Theme } from '../deck/schema'
import { mix, readableOn } from '../deck/themes'

export { mix }

/**
 * Charts are drawn by hand (spec: no chart library). chartLayout() is a pure function: chart
 * data, the theme and a size in, a list of plain shapes out. The slide draws those shapes as SVG,
 * so a chart is vector everywhere (canvas, thumbnails, presenting, PDF). Tests check the shapes
 * directly: every label inside the chart and no two labels overlapping, whatever the data.
 */

export type ChartData = Pick<ChartElement, 'chartType' | 'title' | 'categories' | 'series' | 'options'>

export interface TextMark {
  kind: 'text'
  x: number
  y: number
  text: string
  size: number
  anchor: 'start' | 'middle' | 'end'
  /** Degrees, around (x, y). */
  rotate?: number
  weight?: number
  fill: string
  /** Bounding box, for the overlap tests. */
  box: Box
}
export type Mark =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number }
  | { kind: 'path'; d: string; fill: string; stroke: string; width: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; stroke: string; width: number }
  | TextMark

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface ChartLayout {
  marks: Mark[]
  /** The plotting area (bar and line), for tests. */
  plot: Box | null
}

/** Average glyph width as a share of the font size: an estimate, on the generous side. */
const GLYPH = 0.58

export const textWidth = (text: string, size: number) => text.length * size * GLYPH

/** `text` shortened with "…" to fit `max` units at `size`. */
export function fit(text: string, size: number, max: number) {
  // A hair of slack: a width worked out as "room minus swatch" can land a rounding error short.
  if (textWidth(text, size) <= max + 0.01) return text
  const chars = Math.max(1, Math.floor(max / (size * GLYPH)) - 1)
  return text.slice(0, chars).trimEnd() + '…'
}

const SLOTS = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const

/**
 * The n-th color of the chart palette: the theme's six accents in order (spec: no colors are
 * stored). Past six (pie slices), the accents come round again, lighter.
 */
export function seriesColor(theme: Theme, n: number) {
  const base = theme.colors[SLOTS[n % 6]]
  const round = Math.floor(n / 6)
  return round ? mix(base, theme.colors.background, Math.min(0.6, 0.4 * round)) : base
}

/** Tick values from `min` to `max`, about `count` of them, at round steps (1, 2, 2.5 or 5 × 10ⁿ). */
export function niceTicks(min: number, max: number, count = 5) {
  if (min === max) {
    if (min === 0) max = 1
    else if (min > 0) min = 0
    else max = 0
  }
  const raw = (max - min) / Math.max(1, count)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const lo = Math.floor(min / step + 1e-9) * step
  const hi = Math.ceil(max / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : +v.toPrecision(12))
  return ticks
}

/** "1,250", "0.5", "-3": short and in the reader's own number style. */
export const formatNumber = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })

function text(x: number, y: number, s: string, size: number, fill: string, anchor: TextMark['anchor'] = 'middle', extra: Partial<TextMark> = {}): TextMark {
  const w = textWidth(s, size)
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2
  // y is the text's middle (drawn with dominant-baseline: central).
  return { kind: 'text', x, y, text: s, size, anchor, fill, box: { x: left, y: y - size * 0.6, w, h: size * 1.2 }, ...extra }
}

/** Box of a label rotated -45° whose end sits at (x, y). */
function slantedBox(x: number, y: number, w: number, size: number): Box {
  const d = w * Math.SQRT1_2
  const t = size * Math.SQRT1_2
  return { x: x - d - t / 2, y: y - t / 2, w: d + t, h: d + t }
}

export function chartLayout(chart: ChartData, theme: Theme, width: number, height: number): ChartLayout {
  const ink = theme.colors.text
  const grid = mix(theme.colors.text, theme.colors.background, 0.82)
  const base = Math.max(11, Math.min(22, Math.min(width, height) / 20))
  const pad = base * 0.6
  const marks: Mark[] = []
  let top = pad
  let bottom = height - pad
  const left = pad
  const right = width - pad

  if (chart.title.trim()) {
    const size = base * 1.25
    marks.push(text(width / 2, top + size * 0.6, fit(chart.title.trim(), size, right - left), size, ink, 'middle', { weight: 700 }))
    top += size * 1.2 + pad
  }

  // The legend: series names (categories for pie), in rows along the bottom.
  const pie = chart.chartType === 'pie'
  const entries = pie ? chart.categories : chart.series.map((s) => s.name)
  if (chart.options.legend && entries.length) {
    const size = base * 0.85
    const swatch = size * 0.8
    const gap = size * 1.2
    const maxItem = Math.min(right - left, Math.max(...entries.map((e) => swatch + size * 0.4 + textWidth(e, size))))
    const itemW = (e: string) => Math.min(maxItem, swatch + size * 0.4 + textWidth(e, size))
    const rows: string[][] = [[]]
    let lineW = 0
    entries.forEach((e) => {
      const w = itemW(e)
      if (rows.at(-1)!.length && lineW + gap + w > right - left) {
        rows.push([])
        lineW = 0
      }
      lineW += (rows.at(-1)!.length ? gap : 0) + w
      rows.at(-1)!.push(e)
    })
    const rowH = size * 1.5
    let index = 0
    rows.forEach((row, r) => {
      const total = row.reduce((sum, e, i) => sum + itemW(e) + (i ? gap : 0), 0)
      let x = (width - total) / 2
      const y = bottom - (rows.length - r - 0.5) * rowH
      for (const e of row) {
        const color = seriesColor(theme, index++)
        marks.push({ kind: 'rect', x, y: y - swatch / 2, w: swatch, h: swatch, fill: color })
        const label = fit(e, size, itemW(e) - swatch - size * 0.4)
        marks.push(text(x + swatch + size * 0.4, y, label, size, ink, 'start'))
        x += itemW(e) + gap
      }
    })
    bottom -= rows.length * rowH + pad * 0.5
  }

  if (pie) return { marks: [...marks, ...pieMarks(chart, theme, { x: left, y: top, w: right - left, h: bottom - top }, base)], plot: null }

  // Axis titles. The side one is placed once the plot's height is known.
  const axisSize = base * 0.9
  const yTitle = chart.options.yTitle.trim()
  const titleColumn = yTitle ? axisSize * 1.2 + pad * 0.5 : 0
  if (chart.options.xTitle.trim()) {
    marks.push(text((left + titleColumn + right) / 2, bottom - axisSize * 0.6, fit(chart.options.xTitle.trim(), axisSize, right - left - titleColumn), axisSize, ink))
    bottom -= axisSize * 1.2 + pad * 0.5
  }

  // The value scale: zero always shows, so bars start from it. Fewer steps on a short chart, so
  // their labels never touch.
  const values = chart.series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v))
  const tickSize = base * 0.8
  const n = chart.categories.length
  let steps = 5
  let layout = axes(steps)
  while (steps > 1 && layout.plot.h / (layout.ticks.length - 1) < tickSize * 1.5) layout = axes(--steps)
  const { ticks, tickLabels, plot, slot, level, catSize, catLabels } = layout
  const lo = ticks[0]
  const hi = ticks.at(-1)!
  const yOf = (v: number) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h

  /** Scale, category labels and plot area for about `count` steps. */
  function axes(count: number) {
    const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), count)
    const tickLabels = ticks.map(formatNumber)
    const labelW = Math.max(...tickLabels.map((t) => textWidth(t, tickSize)))
    const plotLeft = left + titleColumn + labelW + pad * 0.6
    // Category labels: level if they fit their slot, else slanted, shortened to a third of the
    // height and never reaching past the side title's column.
    const slot = (right - plotLeft) / n
    // Slanted, neighbours sit slot × 0.71 apart: the size keeps a gap between them.
    const catSize = Math.max(6, Math.min(base * 0.8, slot / 1.75))
    const level = Math.max(...chart.categories.map((c) => textWidth(c, catSize))) <= slot * 0.92
    const maxSlant = (bottom - top) / 3 / Math.SQRT1_2
    const minX = left + titleColumn
    const catLabels = chart.categories.map((c, i) => {
      if (level) return fit(c, catSize, slot * 0.92)
      const cx = plotLeft + slot * (i + 0.5)
      return fit(c, catSize, Math.min(maxSlant, (cx - minX) / Math.SQRT1_2 - catSize * 1.5))
    })
    const catSpace = level ? catSize * 1.4 : Math.max(...catLabels.map((c) => textWidth(c, catSize))) * Math.SQRT1_2 + catSize * 1.2 + tickSize * 0.6
    const plotTop = top + tickSize * 0.6
    const plot: Box = { x: plotLeft, y: plotTop, w: right - plotLeft, h: Math.max(10, bottom - catSpace - plotTop) }
    return { ticks, tickLabels, plot, slot, level, catSize, catLabels }
  }

  if (yTitle) {
    const label = fit(yTitle, axisSize, plot.h)
    const w = textWidth(label, axisSize)
    const cy = plot.y + plot.h / 2
    marks.push({ ...text(left + axisSize * 0.6, cy, label, axisSize, ink), rotate: -90, box: { x: left, y: cy - w / 2, w: axisSize * 1.2, h: w } })
  }
  ticks.forEach((t, i) => {
    const y = yOf(t)
    marks.push({ kind: 'line', x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, stroke: t === 0 ? mix(ink, theme.colors.background, 0.4) : grid, width: t === 0 ? 1.5 : 1 })
    marks.push(text(plot.x - pad * 0.6, y, tickLabels[i], tickSize, ink, 'end'))
  })
  catLabels.forEach((c, i) => {
    const cx = plot.x + slot * (i + 0.5)
    // Slanted labels start below the lowest value label, which sits on the plot's bottom edge.
    const y = plot.y + plot.h + (level ? catSize * 0.9 : tickSize * 0.6 + catSize * 0.6)
    if (level) marks.push(text(cx, y, c, catSize, ink))
    else {
      const w = textWidth(c, catSize)
      marks.push({ ...text(cx, y, c, catSize, ink, 'end'), rotate: -45, box: slantedBox(cx, y, w, catSize) })
    }
  })

  const zero = yOf(Math.max(lo, Math.min(hi, 0)))
  const count = chart.series.length
  if (chart.chartType === 'bar') {
    const group = slot * 0.72
    const barW = group / count
    chart.series.forEach((s, si) => {
      s.values.forEach((v, ci) => {
        if (v === null || !Number.isFinite(v)) return
        const x = plot.x + slot * ci + (slot - group) / 2 + barW * si
        const y = yOf(v)
        marks.push({ kind: 'rect', x: x + barW * 0.06, y: Math.min(y, zero), w: barW * 0.88, h: Math.abs(zero - y), fill: seriesColor(theme, si) })
      })
    })
  } else {
    const r = Math.max(2.5, base * 0.22)
    chart.series.forEach((s, si) => {
      const color = seriesColor(theme, si)
      // A gap (an empty cell) breaks the line rather than dropping to zero.
      let d = ''
      let pen = false
      s.values.forEach((v, ci) => {
        if (v === null || !Number.isFinite(v)) {
          pen = false
          return
        }
        const x = plot.x + slot * (ci + 0.5)
        d += `${pen ? 'L' : 'M'}${round(x)} ${round(yOf(v))} `
        pen = true
      })
      if (d) marks.push({ kind: 'path', d: d.trim(), fill: 'none', stroke: color, width: Math.max(2, base * 0.14) })
      s.values.forEach((v, ci) => {
        if (v === null || !Number.isFinite(v)) return
        marks.push({ kind: 'circle', cx: plot.x + slot * (ci + 0.5), cy: yOf(v), r, fill: color, stroke: theme.colors.background, width: 1 })
      })
    })
  }
  return { marks, plot }
}

const round = (n: number) => Math.round(n * 100) / 100

/** A pie of the first series. Empty, zero and negative values have no slice (a pie can't show them). */
function pieMarks(chart: ChartData, theme: Theme, area: Box, base: number): Mark[] {
  const values = (chart.series[0]?.values ?? []).map((v) => (v !== null && Number.isFinite(v) && v > 0 ? v : 0))
  const total = values.reduce((a, b) => a + b, 0)
  const cx = area.x + area.w / 2
  const cy = area.y + area.h / 2
  const r = Math.max(4, Math.min(area.w, area.h) / 2 - base * 0.2)
  const ink = theme.colors.text
  if (total <= 0) {
    return [
      { kind: 'circle', cx, cy, r, fill: 'none', stroke: mix(ink, theme.colors.background, 0.7), width: 2 },
      text(cx, cy, fit('No positive numbers to show', base * 0.85, r * 1.8), base * 0.85, ink),
    ]
  }
  const marks: Mark[] = []
  const labels: Mark[] = []
  let angle = -Math.PI / 2
  values.forEach((v, i) => {
    if (!v) return
    const sweep = (v / total) * Math.PI * 2
    const color = seriesColor(theme, i)
    if (sweep >= Math.PI * 2 - 1e-9) marks.push({ kind: 'circle', cx, cy, r, fill: color, stroke: theme.colors.background, width: 2 })
    else {
      const a2 = angle + sweep
      const p = (a: number) => `${round(cx + r * Math.cos(a))} ${round(cy + r * Math.sin(a))}`
      marks.push({ kind: 'path', d: `M${round(cx)} ${round(cy)} L${p(angle)} A${round(r)} ${round(r)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${p(a2)} Z`, fill: color, stroke: theme.colors.background, width: 2 })
    }
    // The share, inside the slice when it has room.
    const share = `${Math.round((v / total) * 100)}%`
    const size = base * 0.8
    const mid = angle + sweep / 2
    const lr = sweep >= Math.PI * 2 - 1e-9 ? 0 : r * 0.62
    const room = sweep * lr
    if (sweep >= Math.PI * 2 - 1e-9 || (room > textWidth(share, size) * 1.3 && r > size * 3)) {
      labels.push(text(cx + lr * Math.cos(mid), cy + lr * Math.sin(mid), share, size, readableOn(color, theme), 'middle', { weight: 700 }))
    }
    angle += sweep
  })
  return [...marks, ...labels]
}



/** The four corners of a label as drawn (turned, for slanted and side labels). For tests. */
export function textCorners(t: TextMark): [number, number][] {
  const w = textWidth(t.text, t.size)
  const x0 = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - w : t.x - w / 2
  const pts: [number, number][] = [[x0, t.y - t.size * 0.6], [x0 + w, t.y - t.size * 0.6], [x0 + w, t.y + t.size * 0.6], [x0, t.y + t.size * 0.6]]
  if (!t.rotate) return pts
  const a = (t.rotate * Math.PI) / 180
  return pts.map(([px, py]) => [t.x + (px - t.x) * Math.cos(a) - (py - t.y) * Math.sin(a), t.y + (px - t.x) * Math.sin(a) + (py - t.y) * Math.cos(a)])
}

const TYPE_NAMES = { bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart' } as const

/** What a screen reader hears when the student wrote no alt text. */
export function chartLabel(chart: Pick<ChartElement, 'alt' | 'title' | 'chartType'>) {
  return chart.alt.trim() || `${TYPE_NAMES[chart.chartType]}${chart.title.trim() ? `: ${chart.title.trim()}` : ''}`
}
