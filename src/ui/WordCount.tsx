import { useEditorState, type Editor } from '@tiptap/react'
import { countDoc, countRange } from '../editor/counts'

const fmt = new Intl.NumberFormat()
const plural = (n: number, word: string) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`

/** "1,234 words · 6,789 characters", or "12 of 1,234 words" with text selected. */
export function WordCount({ editor }: { editor: Editor }) {
  const c = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const doc = countDoc(e.state.doc)
      const { from, to, empty } = e.state.selection
      const sel = empty ? null : countRange(e.state.doc, from, to)
      return { ...doc, selWords: sel?.words ?? null, selChars: sel?.characters ?? null }
    },
  })
  const text =
    c.selWords !== null
      ? `${fmt.format(c.selWords)} of ${plural(c.words, 'word')} · ${fmt.format(c.selChars!)} of ${plural(c.characters, 'character')}`
      : `${plural(c.words, 'word')} · ${plural(c.characters, 'character')}`
  return (
    <span className="word-count" title={`${fmt.format(c.charactersNoSpaces)} characters without spaces`}>
      {text}
    </span>
  )
}
