import { useEditorState, type Editor } from '@tiptap/react'
import { ChevronDown } from 'lucide-react'
import { CellSelection } from '@tiptap/pm/tables'
import type { ImageAlign } from '../editor/image'
import type { Ask } from './dialogTypes'
import { editLink, insertTable, pickAndInsertImage, selectedImage } from './insertActions'
import { MenuItem, MenuSeparator } from './MenuItem'
import { Popover } from './Popover'

interface MenuProps {
  editor: Editor
  ask: Ask
}

function Menu({ label, editor, children }: { label: string; editor: Editor; children: (close: () => void) => React.ReactNode }) {
  return (
    <Popover
      menu
      label={label}
      className="menubar-item"
      onClosed={() => editor.view.focus()}
      trigger={
        <>
          {label} <ChevronDown size={14} aria-hidden="true" />
        </>
      }
    >
      {children}
    </Popover>
  )
}

export function InsertMenu({ editor, ask }: MenuProps) {
  return (
    <Menu label="Insert" editor={editor}>
      {(close) => {
        const pick = (fn: () => unknown) => () => {
          close()
          void fn()
        }
        return (
          <>
            <MenuItem label="Table…" onSelect={pick(() => insertTable(editor, ask))} />
            <MenuItem label="Image…" onSelect={pick(() => pickAndInsertImage(editor))} />
            <MenuItem label="Link…" shortcut="Mod+K" onSelect={pick(() => editLink(editor, ask))} />
            <MenuSeparator />
            <MenuItem label="Page break" shortcut="Mod+Enter" onSelect={pick(() => editor.chain().focus().setPageBreak().run())} />
          </>
        )
      }}
    </Menu>
  )
}

/** Shown in the menu bar only while the cursor is in a table. */
export function TableMenu({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      inTable: e.isActive('table'),
      canMerge: e.state.selection instanceof CellSelection && e.can().mergeCells(),
      canSplit: e.can().splitCell(),
      headerRow: e.isActive('tableHeader'),
    }),
  })
  if (!s.inTable) return null
  return (
    <Menu label="Table" editor={editor}>
      {(close) => {
        const run = (fn: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => () => {
          close()
          fn(editor.chain().focus()).run()
        }
        return (
          <>
            <MenuItem label="Add row above" onSelect={run((c) => c.addRowBefore())} />
            <MenuItem label="Add row below" onSelect={run((c) => c.addRowAfter())} />
            <MenuItem label="Add column left" onSelect={run((c) => c.addColumnBefore())} />
            <MenuItem label="Add column right" onSelect={run((c) => c.addColumnAfter())} />
            <MenuSeparator />
            <MenuItem label="Delete row" onSelect={run((c) => c.deleteRow())} />
            <MenuItem label="Delete column" onSelect={run((c) => c.deleteColumn())} />
            <MenuSeparator />
            <MenuItem label="Merge cells" disabled={!s.canMerge} onSelect={run((c) => c.mergeCells())} />
            <MenuItem label="Split cell" disabled={!s.canSplit} onSelect={run((c) => c.splitCell())} />
            <MenuItem label="Header row" checked={s.headerRow} onSelect={run((c) => c.toggleHeaderRow())} />
            <MenuSeparator />
            <MenuItem label="Delete table" onSelect={run((c) => c.deleteTable())} />
          </>
        )
      }}
    </Menu>
  )
}

/** Shown in the menu bar only while an image is selected. */
export function ImageMenu({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const img = selectedImage(e)
      return { selected: !!img, align: (img?.attrs.align as ImageAlign | undefined) ?? 'center' }
    },
  })
  if (!s.selected) return null
  return (
    <Menu label="Image" editor={editor}>
      {(close) => {
        const align = (a: ImageAlign) => () => {
          close()
          editor.chain().focus().setImageAlign(a).run()
        }
        return (
          <>
            <MenuItem label="Align left" checked={s.align === 'left'} onSelect={align('left')} />
            <MenuItem label="Center" checked={s.align === 'center'} onSelect={align('center')} />
            <MenuItem label="Align right" checked={s.align === 'right'} onSelect={align('right')} />
            <MenuSeparator />
            <MenuItem
              label="Delete image"
              onSelect={() => {
                close()
                editor.chain().focus().deleteSelection().run()
              }}
            />
          </>
        )
      }}
    </Menu>
  )
}
