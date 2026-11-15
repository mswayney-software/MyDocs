import type { Extensions } from '@tiptap/core'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { ParagraphFormat } from './paragraph-format'
import { NormalizedColor, NormalizedFontFamily, NormalizedFontSize, NormalizedHighlight } from './text-style'
import { Title } from './title'

/** The one extension list used by the app and by every test. */
export function createExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Out of v1 scope, or arriving in a later milestone (links: M4).
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      // Word has no phantom empty line after a final heading, and Tiptap's version
      // piled up blank lines each time a style was applied to the whole document.
      trailingNode: false,
      undoRedo: { depth: 500 },
    }),
    Title,
    TextStyle,
    NormalizedFontFamily,
    NormalizedFontSize,
    NormalizedColor,
    NormalizedHighlight,
    Subscript,
    Superscript,
    TextAlign.configure({
      types: ['paragraph', 'heading', 'title'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    ParagraphFormat,
  ]
}
