import { LIMITS } from '../deck/schema'
import type { ChartEdit } from '../canvas/controller'

/**
 * A number typed into a chart data cell. Empty is a gap in the chart (null). "1,250", "-3.5",
 * "+7", "12%" and a typographic minus sign are all read as numbers; anything else isn't one.
 */
export function readCell(raw: string): { value: number | null; ok: boolean } {
  const s = raw.trim().replace(/−/g, '-').replace(/^\+/, '').replace(/%$/, '').replace(/[\s,]/g, '')
  if (!s) return { value: null, ok: true }
  if (!/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return { value: null, ok: false }
  const value = Number(s)
  return Number.isFinite(value) ? { value, ok: true } : { value: null, ok: false }
}

/** How a number shows in its cell when the window opens. */
export const cellText = (v: number | null) => (v === null ? '' : String(v))

/** The chart data window's draft: everything as typed. */
export interface ChartDraft {
  chartType: ChartEdit['chartType']
  title: string
  alt: string
  legend: boolean
  xTitle: string
  yTitle: string
  categories: string[]
  names: string[]
  /** cells[category][series] */
  cells: string[][]
}

export function toDraft(c: ChartEdit): ChartDraft {
  return {
    chartType: c.chartType,
    title: c.title,
    alt: c.alt,
    legend: c.options.legend,
    xTitle: c.options.xTitle,
    yTitle: c.options.yTitle,
    categories: [...c.categories],
    names: c.series.map((s) => s.name),
    cells: c.categories.map((_, ci) => c.series.map((s) => cellText(s.values[ci] ?? null))),
  }
}

/** The draft as chart data. Cells that aren't numbers count as empty (the window won't apply them). */
export function fromDraft(d: ChartDraft): ChartEdit {
  return {
    chartType: d.chartType,
    title: d.title.trim(),
    alt: d.alt.trim(),
    categories: d.categories.map((c) => c.trim()),
    series: d.names.map((name, si) => ({ name: name.trim(), values: d.cells.map((row) => readCell(row[si] ?? '').value) })),
    options: { legend: d.legend, xTitle: d.xTitle.trim(), yTitle: d.yTitle.trim() },
  }
}

/** Cells that aren't numbers, as "row,column". */
export function badCells(d: ChartDraft): Set<string> {
  const bad = new Set<string>()
  d.cells.forEach((row, ci) => row.forEach((v, si) => !readCell(v).ok && bad.add(`${ci},${si}`)))
  return bad
}

export const canAddCategory = (d: ChartDraft) => d.categories.length < LIMITS.chartCategories
export const canAddSeries = (d: ChartDraft) => d.names.length < LIMITS.chartSeries

export function addCategory(d: ChartDraft): ChartDraft {
  if (!canAddCategory(d)) return d
  return { ...d, categories: [...d.categories, `Group ${d.categories.length + 1}`], cells: [...d.cells, d.names.map(() => '')] }
}
export function removeCategory(d: ChartDraft, i: number): ChartDraft {
  if (d.categories.length <= 1) return d
  return { ...d, categories: d.categories.filter((_, k) => k !== i), cells: d.cells.filter((_, k) => k !== i) }
}
export function addSeries(d: ChartDraft): ChartDraft {
  if (!canAddSeries(d)) return d
  return { ...d, names: [...d.names, `Series ${d.names.length + 1}`], cells: d.cells.map((row) => [...row, '']) }
}
export function removeSeries(d: ChartDraft, i: number): ChartDraft {
  if (d.names.length <= 1) return d
  return { ...d, names: d.names.filter((_, k) => k !== i), cells: d.cells.map((row) => row.filter((_, k) => k !== i)) }
}
