import { Extension, type Editor } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'

/**
 * Backspace just after a table and Delete just before one.
 *
 * No standard command handles these (a paragraph can't merge into a table), so the browser
 * used to run its own Backspace on the page. Chrome then moved the paragraph's DOM into the
 * table's wrapper: the text stayed on screen but vanished from the document, and was lost
 * on save. Now, as in Google Docs, the cursor moves into the table instead, and an empty
 * paragraph between is removed.
 */
function besideTable(editor: Editor, dir: -1 | 1): boolean {
  // The browser reports cursor moves (Home, arrows) a moment late. Read the real cursor
  // first; acting on a stale one would hand this key back to the browser.
  ;(editor.view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.()
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return false
  const $pos = selection.$from
  const block = $pos.parent
  if (!block.isTextblock) return false
  const atEdge = dir < 0 ? $pos.parentOffset === 0 : $pos.parentOffset === block.content.size
  if (!atEdge) return false

  const depth = $pos.depth
  const container = $pos.node(depth - 1)
  const index = $pos.index(depth - 1)
  const neighbor = dir < 0 ? (index > 0 ? container.child(index - 1) : null) : index < container.childCount - 1 ? container.child(index + 1) : null
  if (neighbor?.type.name !== 'table') return false

  const blockStart = $pos.before(depth)
  const blockEnd = $pos.after(depth)
  const tr = state.tr
  // An empty paragraph between is removed, unless it is the document's last line.
  const removable = block.content.size === 0 && !(dir < 0 && index === container.childCount - 1 && depth === 1)
  if (removable) tr.delete(blockStart, blockEnd)
  // Into the table: end of the last cell (Backspace) or start of the first (Delete).
  const edge = dir < 0 ? tr.mapping.map(blockStart, -1) : tr.mapping.map(removable ? blockStart : blockEnd, 1)
  const target = Selection.findFrom(tr.doc.resolve(edge), dir, true)
  if (!target) return false
  tr.setSelection(target).scrollIntoView()
  editor.view.dispatch(tr)
  return true
}

export const TableEdges = Extension.create({
  name: 'tableEdges',
  // Before the default Backspace and Delete handling.
  priority: 1100,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => besideTable(editor, -1),
      Delete: ({ editor }) => besideTable(editor, 1),
    }
  },
})
