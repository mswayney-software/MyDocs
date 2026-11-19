import type { Extensions } from '@tiptap/core'
import Subscript from '@tiptap/extension-subscript'
import { TableKit } from '@tiptap/extension-table'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import { ParagraphFormat } from './paragraph-format'
import { NormalizedColor, NormalizedFontFamily, NormalizedFontSize, NormalizedHighlight } from './text-style'
import { DocImage } from './image'
import { isSafeLink } from './links'
import { StrikeX } from '@mysuite/core/editor/strike'
import { PageBreak } from './page-break'
import { Search } from './search'
import { Title } from './title'
import { TableEdges } from './table-edges'
import { DocumentEdges } from './document-edges'
import { TrailingParagraph } from './trailing-paragraph'

/** The one extension list used by the app and by every test. */
export function createExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Out of v1 scope.
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: {
        // A click places the cursor, as in Word; Ctrl+click opens the link (handled in App).
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        // Web and email links only: never javascript:, data: or file: addresses.
        isAllowedUri: (url) => isSafeLink(url),
      },
      // Word has no phantom empty line after a final heading, and Tiptap's version
      // piled up blank lines each time a style was applied to the whole document.
      trailingNode: false,
      // Ctrl+Shift+S is Save as; strikethrough is on Ctrl+Shift+X (StrikeX, below).
      strike: false,
      undoRedo: { depth: 500 },
    }),
    StrikeX,
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
    TableKit.configure({ table: { resizable: false, allowTableNodeSelection: true } }),
    DocImage,
    PageBreak,
    Search,
    TrailingParagraph,
    TableEdges,
    DocumentEdges,
  ]
}
