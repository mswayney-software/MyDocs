import type { Editor } from '@tiptap/react'
import type { BlockStyle } from './useFormatState'

export function setBlockStyle(editor: Editor, style: BlockStyle) {
  const chain = editor.chain().focus()
  switch (style) {
    case 'paragraph':
      return chain.setParagraph().run()
    case 'title':
      return chain.setTitle().setTextAlign('center').run()
    default:
      return chain.setHeading({ level: Number(style.slice(1)) as 1 | 2 | 3 }).run()
  }
}
