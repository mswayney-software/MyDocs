import { Extension, type CommandProps, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'

/** Block types that carry paragraph formatting. */
export const FORMATTED_BLOCKS = ['paragraph', 'heading', 'title']
export const LINE_SPACINGS = [1, 1.15, 1.5, 2] as const
export const DEFAULT_LINE_SPACING = 1.15
/** Indent step in inches. */
export const INDENT_STEP = 0.5
export const MAX_INDENT = 6

export interface ParagraphAttrs {
  /** Unitless line height multiple; null = default. */
  lineHeight: number | null
  /** Points. */
  spaceBefore: number | null
  /** Points. */
  spaceAfter: number | null
  /** Left indent in inches. */
  indent: number | null
  /** First-line indent in inches; negative = hanging indent. */
  firstLine: number | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      setParagraphSpacing: (value: number | null) => ReturnType
      setSpaceBefore: (pt: number | null) => ReturnType
      setSpaceAfter: (pt: number | null) => ReturnType
      changeIndent: (direction: 1 | -1) => ReturnType
      toggleFirstLineIndent: () => ReturnType
      toggleHangingIndent: () => ReturnType
      resetParagraphFormat: () => ReturnType
    }
  }
}

const parseUnit = (value: string, unit: string): number | null => {
  if (!value || !value.endsWith(unit)) return null
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : null
}
const round = (n: number) => Math.round(n * 100) / 100
const clampIndent = (n: number) => {
  const v = round(Math.min(MAX_INDENT, Math.max(0, n)))
  return v === 0 ? null : v
}

/** Apply `fn` to every formatted block touched by the selection. */
function updateBlocks(fn: (attrs: ParagraphAttrs) => Partial<ParagraphAttrs> | null) {
  return ({ tr, state, dispatch }: CommandProps) => {
    const { from, to } = state.selection
    let changed = false
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!FORMATTED_BLOCKS.includes(node.type.name)) return
      const next = fn(node.attrs as ParagraphAttrs)
      if (!next) return
      changed = true
      if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next })
    })
    return changed
  }
}

/** First formatted block in the selection, used to decide toggle direction. */
function firstBlockAttrs(props: CommandProps): ParagraphAttrs | null {
  const { from, to } = props.state.selection
  let found: ParagraphAttrs | null = null
  props.state.doc.nodesBetween(from, to, (node) => {
    if (found) return false
    if (FORMATTED_BLOCKS.includes(node.type.name)) found = node.attrs as ParagraphAttrs
  })
  return found
}

export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',
  // Runs before the default Enter and Tab handling.
  priority: 1000,

  addGlobalAttributes() {
    return [
      {
        types: FORMATTED_BLOCKS,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => {
              const raw = el.style.lineHeight
              const n = parseFloat(raw)
              return Number.isFinite(n) && !/[a-z%]/i.test(raw) ? n : null
            },
            renderHTML: (a) => (a.lineHeight == null ? {} : { style: `line-height: ${a.lineHeight}` }),
          },
          spaceBefore: {
            default: null,
            parseHTML: (el) => parseUnit(el.style.marginTop, 'pt'),
            renderHTML: (a) => (a.spaceBefore == null ? {} : { style: `margin-top: ${a.spaceBefore}pt` }),
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => parseUnit(el.style.marginBottom, 'pt'),
            renderHTML: (a) => (a.spaceAfter == null ? {} : { style: `margin-bottom: ${a.spaceAfter}pt` }),
          },
          indent: {
            default: null,
            parseHTML: (el) => parseUnit(el.style.marginLeft, 'in'),
            renderHTML: (a) => (a.indent == null ? {} : { style: `margin-left: ${a.indent}in` }),
          },
          firstLine: {
            default: null,
            parseHTML: (el) => parseUnit(el.style.textIndent, 'in'),
            renderHTML: (a) => (a.firstLine == null ? {} : { style: `text-indent: ${a.firstLine}in` }),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setParagraphSpacing: (value) => updateBlocks(() => ({ lineHeight: value })),
      setSpaceBefore: (pt) => updateBlocks(() => ({ spaceBefore: pt })),
      setSpaceAfter: (pt) => updateBlocks(() => ({ spaceAfter: pt })),
      changeIndent: (direction) =>
        updateBlocks((a) => {
          const next = clampIndent((a.indent ?? 0) + direction * INDENT_STEP)
          return next === a.indent ? null : { indent: next }
        }),
      toggleFirstLineIndent: () => (props) => {
        const on = (firstBlockAttrs(props)?.firstLine ?? 0) > 0
        return updateBlocks((a) => {
          // Leaving hanging mode also gives back the indent it added.
          const indent = (a.firstLine ?? 0) < 0 ? clampIndent((a.indent ?? 0) + (a.firstLine ?? 0)) : a.indent
          return { firstLine: on ? null : INDENT_STEP, indent }
        })(props)
      },
      toggleHangingIndent: () => (props) => {
        const on = (firstBlockAttrs(props)?.firstLine ?? 0) < 0
        return updateBlocks((a) => {
          if (on) return { firstLine: null, indent: clampIndent((a.indent ?? 0) - INDENT_STEP) }
          const indent = (a.firstLine ?? 0) < 0 ? a.indent : clampIndent((a.indent ?? 0) + INDENT_STEP)
          return { firstLine: -INDENT_STEP, indent }
        })(props)
      },
      resetParagraphFormat: () =>
        updateBlocks(() => ({ lineHeight: null, spaceBefore: null, spaceAfter: null, indent: null, firstLine: null })),
    }
  },

  addProseMirrorPlugins() {
    return [
      // List items get their indent from the list, as in Word. Paragraph indents that
      // ride along into a list (toggling a list on, pasting) are dropped.
      new Plugin({
        key: new PluginKey('listIndentCleanup'),
        appendTransaction: (transactions, _old, state) => {
          const ranges = changedRanges(transactions)
          if (!ranges.length) return null
          let tr: Transaction | null = null
          for (const [from, to] of ranges) {
            state.doc.nodesBetween(from, Math.min(to, state.doc.content.size), (node, pos, parent) => {
              if (node.type.name !== 'paragraph' || parent?.type.name !== 'listItem') return
              if (node.attrs.indent == null && node.attrs.firstLine == null) return
              tr ??= state.tr
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: null, firstLine: null })
            })
          }
          return tr
        },
      }),
    ]
  },

  addKeyboardShortcuts() {
    return {
      // In a list, Tab nests the item. Elsewhere, Tab at the start of a paragraph
      // adds a first-line indent, and anywhere else it types a tab character.
      Tab: ({ editor }) => {
        if (editor.isActive('listItem')) return editor.commands.sinkListItem('listItem')
        const { selection } = editor.state
        const atStart = selection.empty && selection.$from.parentOffset === 0
        const attrs = selection.$from.parent.attrs as ParagraphAttrs
        if (atStart && !((attrs.firstLine ?? 0) > 0)) return editor.commands.toggleFirstLineIndent()
        return editor.commands.insertContent('\t')
      },
      // Shift+Tab undoes the above. With nothing to undo it falls through,
      // so keyboard users can still move focus back to the toolbar.
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('listItem')) return editor.commands.liftListItem('listItem')
        const attrs = editor.state.selection.$from.parent.attrs as ParagraphAttrs
        if ((attrs.firstLine ?? 0) > 0) return editor.commands.toggleFirstLineIndent()
        return false
      },
      'Mod-Space': ({ editor }) => clearFormatting(editor),
      // Enter at the end of a title or heading starts plain Normal text, as in Word.
      // Without this, a centered title would center everything typed after it.
      Enter: ({ editor }) => {
        const { selection } = editor.state
        const { parent, parentOffset } = selection.$from
        if (!selection.empty || !['title', 'heading'].includes(parent.type.name)) return false
        if (parentOffset !== parent.content.size) return false
        return editor
          .chain()
          .splitBlock({ keepMarks: false })
          .setParagraph()
          .unsetTextAlign()
          .resetParagraphFormat()
          .run()
      },
    }
  },
})

/** Ranges of the final document touched by these transactions. */
function changedRanges(transactions: readonly Transaction[]): [number, number][] {
  const ranges: [number, number][] = []
  transactions.forEach((tr, i) => {
    if (!tr.docChanged) return
    tr.mapping.maps.forEach((map, j) => {
      map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        // Map forward through the rest of this transaction and every later one.
        let from = newStart
        let to = newEnd
        for (const m of tr.mapping.maps.slice(j + 1)) { from = m.map(from, -1); to = m.map(to, 1) }
        for (const later of transactions.slice(i + 1)) { from = later.mapping.map(from, -1); to = later.mapping.map(to, 1) }
        // Wrapping (as in toggling a list) changes only the wrapper tokens; widen the
        // range so it reaches the block just inside them.
        ranges.push([Math.max(0, from - 2), to + 2])
      })
    })
  })
  return ranges
}

/** Word-style "clear formatting": character formatting and paragraph style back to Normal. */
export function clearFormatting(editor: Editor) {
  return editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().resetParagraphFormat().run()
}
