import { Node } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType
    }
  }
}

/** Manual page break. Shown as a labeled line on screen; starts a new page when printed (M5). */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [
      { tag: 'div[data-type="page-break"]' },
      // Word and Google Docs page breaks in pasted HTML.
      { tag: 'br[style*="page-break-before"]' },
      { tag: 'hr[style*="page-break"]' },
    ]
  },

  renderHTML() {
    return ['div', { 'data-type': 'page-break', class: 'page-break', contenteditable: 'false' }]
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ tr, chain, editor }) => {
          // Not inside a table, where a page break has no meaning (Word doesn't allow it either).
          if (editor.isActive('table')) return false
          // Its own undo step: Ctrl+Z removes the break, not the typing just before it.
          closeHistory(tr)
          return chain()
            .insertContent([{ type: this.name }, { type: 'paragraph' }])
            .run()
        },
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() }
  },
})
