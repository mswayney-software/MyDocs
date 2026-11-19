import { MenuItem, MenuSeparator, Popover } from '@mysuite/core/ui'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { PaintBucket, Sheet, Table2 } from 'lucide-react'
import { useState } from 'react'
import type { CanvasController } from '../canvas/controller'
import { LIMITS, type Color, type Theme } from '../deck/schema'
import { ColorPicker } from './ColorPicker'

const ICON = { size: 18, strokeWidth: 2, 'aria-hidden': true } as const

/** Insert a table: how many rows and columns (spec limits: 20 by 10). */
export function TableInsert({ controller }: { controller: CanvasController }) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  // Arrow keys change the numbers here; the popover's own arrow-key moves must not take them.
  const keepArrows = (e: React.KeyboardEvent) => {
    if (e.key.startsWith('Arrow')) e.stopPropagation()
  }
  const clamp = (v: string, max: number) => Math.max(1, Math.min(max, Math.round(Number(v) || 1)))
  return (
    <Popover label="Table" trigger={<Table2 {...ICON} />} title="Table">
      {(close) => (
        <form
          className="table-size"
          onSubmit={(e) => {
            e.preventDefault()
            close()
            controller.insertTable(rows, cols)
          }}
        >
          <label htmlFor="table-rows">Rows</label>
          <input id="table-rows" type="number" min={1} max={LIMITS.tableRows} value={rows} onKeyDown={keepArrows} onChange={(e) => setRows(clamp(e.target.value, LIMITS.tableRows))} />
          <label htmlFor="table-cols">Columns</label>
          <input id="table-cols" type="number" min={1} max={LIMITS.tableColumns} value={cols} onKeyDown={keepArrows} onChange={(e) => setCols(clamp(e.target.value, LIMITS.tableColumns))} />
          <button type="submit" className="dlg-btn dlg-primary" data-item>
            Insert table
          </button>
        </form>
      )}
    </Popover>
  )
}

/** Rows and columns in the table being edited. */
const tableSize = (e: Editor) => {
  const table = e.state.doc.firstChild
  return { rows: table?.childCount ?? 0, cols: table?.firstChild?.childCount ?? 0 }
}

/**
 * While a table's cells are being edited: add and remove rows and columns, the header row, and
 * the fill of the selected cells. Everything runs in the live editor, so Ctrl+Z inside the table
 * undoes it step by step, and leaving the table makes it one deck step.
 */
export function TableTools({ editor, theme }: { editor: Editor; theme: Theme }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { rows, cols } = tableSize(e)
      const cell = e.isActive('tableHeader') ? e.getAttributes('tableHeader') : e.getAttributes('tableCell')
      return {
        rows,
        cols,
        header: e.state.doc.firstChild?.firstChild?.firstChild?.type.name === 'tableHeader',
        fill: (cell.fill ?? null) as Color,
      }
    },
  })
  const run = () => editor.chain().focus()
  const refocus = () => editor.commands.focus()
  return (
    <span className="tb-group">
      <Popover menu label="Rows and columns" title="Rows and columns" trigger={<Sheet {...ICON} />} onClosed={refocus}>
        {(close) => {
          const act = (fn: () => void) => () => {
            close()
            fn()
            // The keyboard goes back to the cell now, not a frame later: a Tab pressed right
            // away must move between cells.
            editor.view.focus()
          }
          return (
            <>
              <MenuItem label="Insert row above" disabled={s.rows >= LIMITS.tableRows} onSelect={act(() => run().addRowBefore().run())} />
              <MenuItem label="Insert row below" disabled={s.rows >= LIMITS.tableRows} onSelect={act(() => run().addRowAfter().run())} />
              <MenuItem label="Delete row" disabled={s.rows <= 1} onSelect={act(() => run().deleteRow().run())} />
              <MenuSeparator />
              <MenuItem label="Insert column left" disabled={s.cols >= LIMITS.tableColumns} onSelect={act(() => run().addColumnBefore().run())} />
              <MenuItem label="Insert column right" disabled={s.cols >= LIMITS.tableColumns} onSelect={act(() => run().addColumnAfter().run())} />
              <MenuItem label="Delete column" disabled={s.cols <= 1} onSelect={act(() => run().deleteColumn().run())} />
              <MenuSeparator />
              <MenuItem label="Header row" checked={s.header} onSelect={act(() => run().toggleHeaderRow().run())} />
            </>
          )
        }}
      </Popover>
      <ColorPicker
        label="Cell fill"
        icon={<PaintBucket {...ICON} />}
        current={s.fill}
        theme={theme}
        noneLabel="No fill"
        onPick={(c) => run().setCellAttribute('fill', c).run()}
      />
    </span>
  )
}
