import type { Node as PMNode } from '@tiptap/pm/model'
import { useEditorState, type Editor } from '@tiptap/react'
import { DEFAULT_FONT, DEFAULT_FONT_SIZE, DEFAULT_LINE_SPACING } from '../editor'

export type BlockStyle = 'paragraph' | 'title' | 'h1' | 'h2' | 'h3'
export type Align = 'left' | 'center' | 'right' | 'justify'

/** Default font size per block style, in points; must match index.css. */
export const BLOCK_FONT_SIZE: Record<BlockStyle, number> = {
  paragraph: DEFAULT_FONT_SIZE,
  title: 26,
  h1: 18,
  h2: 14,
  h3: 12,
}

export function blockStyleOf(node: PMNode): BlockStyle {
  if (node.type.name === 'title') return 'title'
  if (node.type.name === 'heading') return `h${node.attrs.level as 1 | 2 | 3}`
  return 'paragraph'
}

const parsePt = (v: unknown) => {
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : null
}

/** One value if the whole selection agrees, null if it is mixed. */
const single = <T,>(values: Set<T>): T | null => (values.size === 1 ? [...values][0] : null)

/**
 * Style, font, size and spacing across the whole selection. A dropdown shows blank
 * (null) when the selection mixes values, as Word does; otherwise picking the value
 * it happens to show would change nothing for the rest of the selection.
 */
function selectionValues(e: Editor) {
  const { selection, storedMarks } = e.state
  const { $from, from, to, empty } = selection

  if (empty) {
    const block = blockStyleOf($from.parent)
    const marks = storedMarks ?? $from.marks()
    const ts = marks.find((m) => m.type.name === 'textStyle')?.attrs
    return {
      block,
      fontFamily: (ts?.fontFamily as string | null) ?? DEFAULT_FONT,
      fontSize: parsePt(ts?.fontSize) ?? BLOCK_FONT_SIZE[block],
      lineHeight: ($from.parent.attrs.lineHeight as number | null) ?? DEFAULT_LINE_SPACING,
    }
  }

  const blocks = new Set<BlockStyle>()
  const fonts = new Set<string>()
  const sizes = new Set<number>()
  const spacings = new Set<number>()
  e.state.doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (node.isTextblock) {
      blocks.add(blockStyleOf(node))
      spacings.add((node.attrs.lineHeight as number | null) ?? DEFAULT_LINE_SPACING)
    } else if (node.isText && parent) {
      const ts = node.marks.find((m) => m.type.name === 'textStyle')?.attrs
      fonts.add((ts?.fontFamily as string | null) ?? DEFAULT_FONT)
      sizes.add(parsePt(ts?.fontSize) ?? BLOCK_FONT_SIZE[blockStyleOf(parent)])
    }
  })
  return {
    block: single(blocks),
    fontFamily: single(fonts),
    fontSize: single(sizes),
    lineHeight: single(spacings),
  }
}

/** What the toolbar and menus show for the current selection. */
export function useFormatState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const para = e.state.selection.$from.parent.attrs
      const text = e.getAttributes('textStyle')
      return {
        ...selectionValues(e),
        color: (text.color as string | undefined) ?? null,
        highlight: e.isActive('highlight') ? ((e.getAttributes('highlight').color as string | undefined) ?? '#ffff00') : null,
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        superscript: e.isActive('superscript'),
        subscript: e.isActive('subscript'),
        align: ((['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left') as Align,
        spaceBefore: (para.spaceBefore as number | null) ?? 0,
        spaceAfter: (para.spaceAfter as number | null) ?? 0,
        firstLine: (para.firstLine as number | null) ?? 0,
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        inList: e.isActive('listItem'),
        blockquote: e.isActive('blockquote'),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      }
    },
  })
}
