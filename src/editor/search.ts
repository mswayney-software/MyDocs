import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SearchMatch {
  from: number
  to: number
}

export interface SearchState {
  query: string
  caseSensitive: boolean
  matches: SearchMatch[]
  /** Index into matches, or -1. */
  current: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    search: {
      setSearch: (query: string, caseSensitive?: boolean) => ReturnType
      clearSearch: () => ReturnType
      nextMatch: () => ReturnType
      previousMatch: () => ReturnType
      replaceMatch: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
    }
  }
}

export const searchKey = new PluginKey<SearchState>('search')
const EMPTY: SearchState = { query: '', caseSensitive: false, matches: [], current: -1 }

/** Stand-in for non-text inline content, so a match never spans an image or line break. */
const OBJECT = '￼'

/**
 * Every match of `query`, in document order. Searches each textblock as one string, so a
 * match can cross formatting changes ("bo**ld**" still matches "bold").
 */
export function findMatches(doc: PMNode, query: string, caseSensitive: boolean): SearchMatch[] {
  if (!query) return []
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: SearchMatch[] = []
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true
    let text = ''
    const positions: number[] = [] // document position of each character in `text`
    block.forEach((child, offset) => {
      const start = blockPos + 1 + offset
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) positions.push(start + i)
        text += child.text
      } else {
        positions.push(start)
        text += OBJECT
      }
    })
    const hay = caseSensitive ? text : text.toLowerCase()
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
      matches.push({ from: positions[i], to: positions[i + needle.length - 1] + 1 })
    }
    return false
  })
  return matches
}

/** First match at or after `pos`, wrapping to the start. */
function matchFrom(matches: SearchMatch[], pos: number) {
  if (!matches.length) return -1
  const i = matches.findIndex((m) => m.from >= pos)
  return i === -1 ? 0 : i
}

function decorations(state: SearchState, doc: PMNode) {
  if (!state.matches.length) return DecorationSet.empty
  return DecorationSet.create(
    doc,
    state.matches.map((m, i) =>
      Decoration.inline(m.from, m.to, { class: i === state.current ? 'search-match search-current' : 'search-match' }),
    ),
  )
}

/** One transaction can both set a query and pick the current match, so meta fields merge. */
type Meta = { query?: string; caseSensitive?: boolean; current?: number; clear?: true }

export const Search = Extension.create({
  name: 'search',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => EMPTY,
          apply(tr, prev, _old, state): SearchState {
            const meta = tr.getMeta(searchKey) as Meta | undefined
            if (meta?.clear) return EMPTY
            if (meta?.query !== undefined) {
              const caseSensitive = meta.caseSensitive ?? false
              const matches = findMatches(state.doc, meta.query, caseSensitive)
              const current = meta.current ?? matchFrom(matches, state.selection.from)
              return { query: meta.query, caseSensitive, matches, current }
            }
            if (meta?.current !== undefined) return { ...prev, current: meta.current }
            if (tr.docChanged && prev.query) {
              const matches = findMatches(state.doc, prev.query, prev.caseSensitive)
              return { ...prev, matches, current: Math.min(prev.current, matches.length - 1) }
            }
            return prev
          },
        },
        props: {
          decorations(state) {
            const s = searchKey.getState(state)
            return s ? decorations(s, state.doc) : null
          },
        },
      }),
    ]
  },

  addCommands() {
    const get = (state: EditorState) => searchKey.getState(state) ?? EMPTY
    /** Select and scroll to match i. */
    const goTo = (tr: Transaction, i: number, m: SearchMatch) =>
      tr
        .setMeta(searchKey, { ...((tr.getMeta(searchKey) as Meta | undefined) ?? {}), current: i })
        .setSelection(TextSelection.create(tr.doc, m.from, m.to))
        .scrollIntoView()

    return {
      setSearch:
        (query, caseSensitive = false) =>
        ({ state, tr, dispatch }) => {
          if (!dispatch) return true
          tr.setMeta(searchKey, { query, caseSensitive })
          // As in browser find: the first match after the cursor is selected and scrolled to.
          const prev = get(state)
          const matches = findMatches(state.doc, query, caseSensitive)
          const from = prev.current >= 0 && prev.matches[prev.current] ? prev.matches[prev.current].from : state.selection.from
          const i = matchFrom(matches, from)
          if (i >= 0) goTo(tr, i, matches[i])
          return true
        },
      clearSearch:
        () =>
        ({ tr }) => {
          tr.setMeta(searchKey, { clear: true })
          return true
        },
      nextMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const s = get(state)
          if (!s.matches.length) return false
          // From the current match, or the first match after the cursor.
          const i = s.current >= 0 ? (s.current + 1) % s.matches.length : matchFrom(s.matches, state.selection.to)
          if (dispatch) goTo(tr, i, s.matches[i])
          return true
        },
      previousMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const s = get(state)
          if (!s.matches.length) return false
          const i = s.current >= 0 ? (s.current - 1 + s.matches.length) % s.matches.length : s.matches.length - 1
          if (dispatch) goTo(tr, i, s.matches[i])
          return true
        },
      replaceMatch:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const s = get(state)
          const m = s.matches[s.current]
          if (!m) return false
          if (dispatch) {
            closeHistory(tr) // its own undo step, separate from any typing just before
            // Keeps the formatting of the replaced text's first character.
            tr.insertText(replacement, m.from, m.to)
            const matches = findMatches(tr.doc, s.query, s.caseSensitive)
            const next = matchFrom(matches, m.from + replacement.length)
            tr.setMeta(searchKey, { query: s.query, caseSensitive: s.caseSensitive })
            if (next >= 0) goTo(tr, next, matches[next])
          }
          return true
        },
      replaceAll:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const s = get(state)
          if (!s.matches.length) return false
          if (dispatch) {
            closeHistory(tr)
            // Back to front, so earlier positions stay valid. One undo step for all of them.
            for (const m of [...s.matches].reverse()) tr.insertText(replacement, m.from, m.to)
            tr.setMeta(searchKey, { query: s.query, caseSensitive: s.caseSensitive })
          }
          return true
        },
    }
  },
})
