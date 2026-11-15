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

/** What the toolbar and menus show for the current selection. */
export function useFormatState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const block: BlockStyle = e.isActive('title') ? 'title'
        : e.isActive('heading', { level: 1 }) ? 'h1'
        : e.isActive('heading', { level: 2 }) ? 'h2'
        : e.isActive('heading', { level: 3 }) ? 'h3'
        : 'paragraph'
      const nodeName = block === 'title' ? 'title' : block === 'paragraph' ? 'paragraph' : 'heading'
      const para = e.getAttributes(nodeName)
      const text = e.getAttributes('textStyle')
      const size = parseFloat(text.fontSize ?? '')
      return {
        block,
        fontFamily: (text.fontFamily as string | undefined) ?? DEFAULT_FONT,
        fontSize: Number.isFinite(size) ? size : BLOCK_FONT_SIZE[block],
        color: (text.color as string | undefined) ?? null,
        highlight: e.isActive('highlight') ? ((e.getAttributes('highlight').color as string | undefined) ?? '#ffff00') : null,
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        superscript: e.isActive('superscript'),
        subscript: e.isActive('subscript'),
        align: ((['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left') as Align,
        lineHeight: (para.lineHeight as number | null) ?? DEFAULT_LINE_SPACING,
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
