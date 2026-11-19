import type { JSONContent } from '@tiptap/core'
import type { Color, RichText, TableElement } from '../deck/schema'

/**
 * Tables are stored as a plain grid of cells (spec, File format). While one is being edited the
 * live editor holds it as a table document; these two functions convert between them (spec,
 * Architecture: "a small mapper converts between the grid and the editor's table").
 */

type Grid = Pick<TableElement, 'headerRow' | 'columnWidths' | 'rows' | 'w'>
type Align = TableElement['rows'][number]['cells'][number]['align']

/** Column widths scaled to add up to the table's width. */
export function fitWidths(widths: number[], total: number): number[] {
  const sum = widths.reduce((a, b) => a + b, 0)
  if (sum <= 0) return widths.map(() => round(total / widths.length))
  const out = widths.map((w) => round((w / sum) * total))
  // Rounding leftovers go to the last column, so they add up exactly.
  out[out.length - 1] = round(out.at(-1)! + total - out.reduce((a, b) => a + b, 0))
  return out
}

const round = (n: number) => Math.round(n * 100) / 100

/** The grid as the editor's document: one table, nothing else. */
export function gridToDoc(t: Grid): JSONContent {
  const widths = fitWidths(t.columnWidths, t.w)
  return {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: t.rows.map((row, r) => ({
          type: 'tableRow',
          content: row.cells.map((cell, c) => ({
            type: t.headerRow && r === 0 ? 'tableHeader' : 'tableCell',
            attrs: { colspan: 1, rowspan: 1, colwidth: [widths[c]], align: cell.align === 'left' ? null : cell.align, fill: cell.fill ?? null },
            content: cell.content.content?.length ? cell.content.content : [{ type: 'paragraph' }],
          })),
        })),
      },
    ],
  }
}

/**
 * The editor's document back as a grid. Columns the editor added have no width yet: they get
 * the average, and then every column is scaled so the table keeps its width. Null if the
 * document holds no table (it always should).
 */
export function docToGrid(doc: JSONContent, width: number): Pick<TableElement, 'headerRow' | 'columnWidths' | 'rows'> | null {
  const table = doc.content?.find((n) => n.type === 'table')
  const rows = table?.content?.filter((r) => r.type === 'tableRow') ?? []
  if (!rows.length || !rows[0].content?.length) return null
  const first = rows[0].content
  const known = first.map((c) => (Array.isArray(c.attrs?.colwidth) ? Number(c.attrs.colwidth[0]) : NaN)).map((w) => (w > 0 ? w : NaN))
  const valid = known.filter((w) => !Number.isNaN(w))
  const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 1
  return {
    headerRow: first.every((c) => c.type === 'tableHeader'),
    columnWidths: fitWidths(
      known.map((w) => (Number.isNaN(w) ? avg : w)),
      width,
    ),
    rows: rows.map((row) => ({
      cells: (row.content ?? []).map((cell) => ({
        content: { type: 'doc', content: cell.content?.length ? cell.content : [{ type: 'paragraph' }] } as RichText,
        fill: (cell.attrs?.fill ?? null) as Color,
        align: (['center', 'right'].includes(cell.attrs?.align) ? cell.attrs?.align : 'left') as Align,
      })),
    })),
  }
}

/** An empty table of `rows` × `cols`, with a header row. */
export function emptyGrid(rows: number, cols: number, width: number): Pick<TableElement, 'headerRow' | 'columnWidths' | 'rows'> {
  return {
    headerRow: true,
    columnWidths: fitWidths(Array(cols).fill(1), width),
    rows: Array.from({ length: rows }, () => ({
      cells: Array.from({ length: cols }, () => ({ content: { type: 'doc', content: [{ type: 'paragraph' }] } as RichText, fill: null, align: 'left' as const })),
    })),
  }
}
