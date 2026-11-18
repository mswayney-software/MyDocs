import { Extension, generateHTML, type Extensions, type JSONContent } from '@tiptap/core'
import { isSafeLink } from '@mysuite/core/editor/links'
import { StrikeX } from '@mysuite/core/editor/strike'
import { NormalizedColor, NormalizedFontFamily, NormalizedFontSize, NormalizedHighlight } from '@mysuite/core/editor/text-style'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import StarterKit from '@tiptap/starter-kit'
import type { RichText } from '../deck/schema'

export const LINE_SPACINGS = [0.9, 1, 1.15, 1.5, 2] as const
/** Points. Slides are read from across a room, so the list runs larger than a paper's. */
export const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 88, 96] as const

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphLineHeight: {
      /** Line spacing of the paragraphs in the selection; null for the default. */
      setParagraphLineHeight: (value: number | null) => ReturnType
    }
  }
}

/** Line spacing on paragraphs, written as MyDocs writes it (a unitless line-height). */
const LineHeight = Extension.create({
  name: 'paragraphLineHeight',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
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
        },
      },
    ]
  },
  addCommands() {
    return {
      setParagraphLineHeight:
        (value) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection
          let changed = false
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.name !== 'paragraph') return
            changed = true
            if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight: value })
          })
          return changed
        },
    }
  },
})

/**
 * Everything a slide text box or table cell can hold: exactly the nodes and marks the file
 * format allows (docs/FILE_FORMAT.md, Rich text). Pasted content outside it is reduced to it.
 * The live editor and the static renderer use this same list, so text looks the same in both.
 */
export function slideTextExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      trailingNode: false,
      // Ctrl+Shift+S is Save as; strikethrough is on Ctrl+Shift+X (StrikeX, below).
      strike: false,
      link: {
        // On a slide, a click edits; links open from the presenter's screen (Phase 5).
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        // Web and email links only: never javascript:, data: or file: addresses.
        isAllowedUri: (url) => isSafeLink(url),
      },
      undoRedo: { depth: 200 },
    }),
    StrikeX,
    TextStyle,
    NormalizedFontFamily,
    NormalizedFontSize,
    NormalizedColor,
    NormalizedHighlight,
    TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    LineHeight,
  ]
}

let shared: Extensions | null = null
const cache = new WeakMap<object, string>()

/**
 * Rich text as HTML, for every place a slide is shown without an editor: the canvas, the
 * slide strip, presenting, printing. Decks are immutable, so each text is rendered once.
 */
export function richTextHtml(content: RichText): string {
  const hit = cache.get(content)
  if (hit !== undefined) return hit
  shared ??= slideTextExtensions()
  let html: string
  try {
    html = generateHTML(content as JSONContent, shared)
  } catch {
    html = '' // validated on open, so this is a bug guard, not an expected path
  }
  cache.set(content, html)
  return html
}

/** True when a text holds no characters (for "Click to add title" hints). */
export function isEmptyText(content: RichText): boolean {
  const walk = (n: { text?: string; content?: unknown[] }): boolean =>
    !n.text && (n.content ?? []).every((c) => walk(c as { text?: string; content?: unknown[] }))
  return walk(content)
}
