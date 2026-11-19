import type { RichText, TableElement } from '../deck/schema'
import { docToGrid, emptyGrid, fitWidths, gridToDoc } from './table-doc'

const text = (s: string): RichText => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: s }] }] }) as RichText

const table = (): TableElement => ({
  id: 'e1',
  type: 'table',
  x: 100,
  y: 100,
  w: 600,
  h: 120,
  headerRow: true,
  columnWidths: [200, 400],
  rows: [
    { cells: [{ content: text('Name'), fill: null, align: 'left' }, { content: text('Score'), fill: null, align: 'right' }] },
    { cells: [{ content: text('Ana'), fill: 'accent2', align: 'left' }, { content: text('91'), fill: '#FFEEAA', align: 'center' }] },
  ],
})

describe('table grid and editor document', () => {
  it('round-trip every cell, fill, alignment and width unchanged', () => {
    const t = table()
    expect(docToGrid(gridToDoc(t), t.w)).toEqual({ headerRow: t.headerRow, columnWidths: t.columnWidths, rows: t.rows })
  })

  it('the header row becomes header cells, and back', () => {
    const doc = gridToDoc(table())
    const rows = doc.content![0].content!
    expect(rows[0].content!.map((c) => c.type)).toEqual(['tableHeader', 'tableHeader'])
    expect(rows[1].content!.map((c) => c.type)).toEqual(['tableCell', 'tableCell'])
    expect(docToGrid(gridToDoc({ ...table(), headerRow: false }), 600)!.headerRow).toBe(false)
  })

  it('a column the editor added gets an average width, and the table keeps its width', () => {
    const doc = gridToDoc(table())
    for (const row of doc.content![0].content!) row.content!.push({ type: 'tableCell', attrs: { colwidth: null }, content: [{ type: 'paragraph' }] })
    const grid = docToGrid(doc, 600)!
    expect(grid.columnWidths).toHaveLength(3)
    expect(grid.columnWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(600, 5)
    expect(grid.columnWidths[2]).toBeCloseTo(grid.columnWidths.reduce((a, b) => a + b, 0) / 3, 0)
  })

  it('widths are scaled to the table width, adding up exactly', () => {
    expect(fitWidths([1, 1, 1], 100).reduce((a, b) => a + b, 0)).toBe(100)
    expect(fitWidths([100, 300], 800)).toEqual([200, 600])
  })

  it('a new table is empty, with a header row', () => {
    const g = emptyGrid(3, 4, 800)
    expect(g.rows).toHaveLength(3)
    expect(g.rows.every((r) => r.cells.length === 4)).toBe(true)
    expect(g.columnWidths).toEqual([200, 200, 200, 200])
    expect(g.headerRow).toBe(true)
  })

  it('a document without a table gives nothing', () => {
    expect(docToGrid({ type: 'doc', content: [{ type: 'paragraph' }] }, 600)).toBeNull()
  })
})
