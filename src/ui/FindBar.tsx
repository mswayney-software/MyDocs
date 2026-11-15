import { useEditorState, type Editor } from '@tiptap/react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { searchKey } from '../editor/search'
import { tooltip } from './shortcuts'

interface FindBarProps {
  editor: Editor
  /** Show the replace row. */
  replace: boolean
  /** Bumped each time Ctrl+F / Ctrl+H is pressed, to refocus and select the search box. */
  focusToken: number
  onClose: () => void
}

export function FindBar({ editor, replace, focusToken, onClose }: FindBarProps) {
  const [query, setQuery] = useState(() => {
    // Start from the selected text, as most editors do.
    const { from, to, empty } = editor.state.selection
    const text = empty ? '' : editor.state.doc.textBetween(from, to, ' ')
    return text.length <= 100 && !text.includes('\n') ? text : ''
  })
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const findInput = useRef<HTMLInputElement>(null)

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const st = searchKey.getState(e.state)
      return { count: st?.matches.length ?? 0, current: st?.current ?? -1 }
    },
  })

  useEffect(() => {
    editor.commands.setSearch(query, caseSensitive)
  }, [editor, query, caseSensitive])

  useEffect(() => {
    findInput.current?.focus()
    findInput.current?.select()
  }, [focusToken])

  // Highlights go away with the bar.
  useEffect(() => () => void editor.commands.clearSearch(), [editor])

  const close = () => {
    onClose()
    editor.commands.focus() // the last match stays selected
  }

  const status = !query
    ? ''
    : s.count === 0
      ? 'No results'
      : s.current >= 0
        ? `${s.current + 1} of ${s.count}`
        : `${s.count} found`

  return (
    <div
      className="findbar"
      role="search"
      aria-label={replace ? 'Find and replace' : 'Find'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          close()
        }
      }}
    >
      <div className="findbar-row">
        <input
          ref={findInput}
          className="findbar-input"
          aria-label="Find"
          placeholder="Find in document"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setMessage(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey) editor.commands.previousMatch()
              else editor.commands.nextMatch()
            }
          }}
        />
        <span className="findbar-status" role="status" aria-live="polite">
          {message ?? status}
        </span>
        <button type="button" className="tb-btn" aria-label="Previous match" title={tooltip('Previous match', 'Shift+Enter')}
          disabled={!s.count} onClick={() => editor.commands.previousMatch()}>
          <ChevronUp size={16} aria-hidden="true" />
        </button>
        <button type="button" className="tb-btn" aria-label="Next match" title={tooltip('Next match', 'Enter')}
          disabled={!s.count} onClick={() => editor.commands.nextMatch()}>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <label className="findbar-check">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => {
            setCaseSensitive(e.target.checked)
            setMessage(null)
          }} />
          Match case
        </label>
        <button type="button" className="tb-btn findbar-close" aria-label="Close find" title={tooltip('Close', 'Escape')} onClick={close}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {replace && (
        <div className="findbar-row">
          <input
            className="findbar-input"
            aria-label="Replace with"
            placeholder="Replace with"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor.commands.replaceMatch(replacement)
              }
            }}
          />
          <button type="button" className="findbar-btn" disabled={s.current < 0} onClick={() => editor.commands.replaceMatch(replacement)}>
            Replace
          </button>
          <button
            type="button"
            className="findbar-btn"
            disabled={!s.count}
            onClick={() => {
              const n = s.count
              editor.commands.replaceAll(replacement)
              setMessage(`Replaced ${n}`)
            }}
          >
            Replace all
          </button>
        </div>
      )}
    </div>
  )
}
