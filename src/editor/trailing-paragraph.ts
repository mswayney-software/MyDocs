import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/** Blocks a cursor can't continue typing after. */
const NEEDS_PARAGRAPH_AFTER = new Set(['table', 'image', 'pageBreak'])

/**
 * Keep a paragraph after a table, image or page break at the end of the document, as Word
 * always does. Without it there is nowhere to click below the last table. Headings and
 * lists don't count (Enter leaves them), so this never piles up empty lines.
 */
export const TrailingParagraph = Extension.create({
  name: 'trailingParagraph',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('trailingParagraph'),
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null
          const last = state.doc.lastChild
          if (!last || !NEEDS_PARAGRAPH_AFTER.has(last.type.name)) return null
          return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create())
        },
      }),
    ]
  },
})
