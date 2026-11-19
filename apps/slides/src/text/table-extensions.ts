import { Extension, generateHTML, Node, type Editor, type Extensions, type JSONContent } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { LIMITS, type TableElement } from '../deck/schema'
import { fitWidths, gridToDoc } from '../elements/table-doc'
import { slideTextExtensions } from './extensions'

/** A cell's fill: a fixed color, or a theme slot drawn through the table's CSS variables. */
const cssFill = (fill: string) => (fill.startsWith('#') ? fill : `var(--slot-${fill})`)

const fill = {
  fill: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-fill'),
    renderHTML: (attrs: { fill?: string | null }) => (attrs.fill ? { 'data-fill': attrs.fill, style: `background: ${cssFill(attrs.fill)}` } : {}),
  },
}

const Cell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...fill }
  },
})
const Header = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...fill }
  },
})

/** Rows in the table being edited. */
const rowCount = (doc: { firstChild: { childCount: number } | null }) => doc.firstChild?.childCount ?? 0

const SlideTable = Table.extend({
  // Tab moves to the next cell; at the last one it adds a row, up to the limit (spec: 20 rows).
  // Removing the whole table isn't a key press: the slide element is deleted from the canvas.
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.commands.goToNextCell()) return true
        if (rowCount(this.editor.state.doc) >= LIMITS.tableRows) return true
        return this.editor.chain().addRowAfter().goToNextCell().run()
      },
      'Shift-Tab': () => this.editor.commands.goToPreviousCell() || true,
    }
  },
  // The table view keeps the column layout up to date as columns come and go; the static drawing
  // gets the same wrapper, so both have the same markup.
}).configure({ resizable: false, renderWrapper: true, HTMLAttributes: { class: 'slide-table' } })

/**
 * Every column keeps a width, and together they keep the table's width: a column the editor just
 * added gets the average, and all are scaled to fit. Without this a new column has no width and
 * the fixed-width table squeezes it to nothing.
 */
const FitColumns = Extension.create<{ width: number }>({
  name: 'fitColumns',
  addOptions: () => ({ width: 0 }),
  addProseMirrorPlugins() {
    const total = this.options.width
    return [
      new Plugin({
        appendTransaction: (trs, _old, state) => {
          if (!total || !trs.some((t) => t.docChanged)) return null
          const table = state.doc.firstChild
          const first = table?.firstChild
          if (!table || !first) return null
          const known = Array.from({ length: first.childCount }, (_, i) => Number(first.child(i).attrs.colwidth?.[0]) || 0)
          const set = known.filter((w) => w > 0)
          const avg = set.length ? set.reduce((a, b) => a + b, 0) / set.length : 1
          const widths = fitWidths(known.map((w) => w || avg), total)
          if (known.every((w, i) => w === widths[i])) return null
          const tr = state.tr
          table.forEach((row, rowOffset) => {
            row.forEach((cell, cellOffset, i) => {
              const pos = 1 + rowOffset + 1 + cellOffset
              if (cell.attrs.colwidth?.[0] !== widths[i]) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, colwidth: [widths[i]] })
            })
          })
          return tr.docChanged ? tr : null
        },
      }),
    ]
  },
})

/** The table editor's document: exactly one table. */
const TableDoc = Node.create({ name: 'doc', topNode: true, content: 'table' })

/**
 * What the one live editor loads while a table is being edited (with the table's width, to keep),
 * and what draws tables everywhere else.
 */
export function slideTableExtensions(width = 0): Extensions {
  return [TableDoc, ...slideTextExtensions({ table: true }), SlideTable, TableRow, Header, Cell, ...(width ? [FitColumns.configure({ width })] : [])]
}

let shared: Extensions | null = null
const cache = new WeakMap<object, string>()

/** A table as HTML for every place a slide shows without an editor. The same markup the editor makes. */
export function tableHtml(el: TableElement): string {
  const hit = cache.get(el)
  if (hit !== undefined) return hit
  shared ??= slideTableExtensions()
  let html = ''
  try {
    html = generateHTML(gridToDoc(el) as JSONContent, shared)
  } catch (err) {
    console.error('Table could not be drawn', err)
  }
  cache.set(el, html)
  return html
}

/** The alignment of the cell with the caret: tables align whole cells (spec, File format). */
export function cellAlign(e: Editor): 'left' | 'center' | 'right' {
  const cell = e.isActive('tableHeader') ? e.getAttributes('tableHeader') : e.getAttributes('tableCell')
  return cell.align === 'center' || cell.align === 'right' ? cell.align : 'left'
}
