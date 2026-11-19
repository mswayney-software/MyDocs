import { Extension, type Editor } from '@tiptap/core'
import { Selection, TextSelection } from '@tiptap/pm/state'

/**
 * Ctrl+Home and Ctrl+End: to the very start or end of the document (with Shift, selecting
 * to there).
 *
 * These used to be left to the browser. Chrome sometimes ignores them while the cursor is
 * inside a table cell, so a student pressing Ctrl+Home to get back to the title stayed put.
 */
function toEdge(editor: Editor, dir: -1 | 1, extend: boolean): boolean {
  const { state, view } = editor
  const edge = dir < 0 ? Selection.atStart(state.doc) : Selection.atEnd(state.doc)
  const selection = extend ? TextSelection.between(state.selection.$anchor, dir < 0 ? edge.$from : edge.$to) : edge
  view.dispatch(state.tr.setSelection(selection).scrollIntoView())
  return true
}

export const DocumentEdges = Extension.create({
  name: 'documentEdges',
  addKeyboardShortcuts() {
    return {
      'Mod-Home': () => toEdge(this.editor, -1, false),
      'Mod-End': () => toEdge(this.editor, 1, false),
      'Shift-Mod-Home': () => toEdge(this.editor, -1, true),
      'Shift-Mod-End': () => toEdge(this.editor, 1, true),
    }
  },
})
