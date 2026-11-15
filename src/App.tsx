import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect } from 'react'
import { createExtensions } from './editor'
import { FormatMenu } from './ui/FormatMenu'
import { Toolbar } from './ui/Toolbar'

export const APP_NAME = 'Open Writer'

export default function App() {
  const editor = useEditor({
    extensions: createExtensions(),
    autofocus: 'start',
    editorProps: {
      attributes: {
        class: 'doc',
        role: 'textbox',
        'aria-label': 'Document',
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
    },
  })

  useEffect(() => {
    if (import.meta.env.VITE_E2E) window.__openWriter = editor
  }, [editor])

  // Alt+F10 moves focus to the toolbar, a common word processor convention.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'F10') {
        e.preventDefault()
        document.querySelector<HTMLElement>('.toolbar button:not(:disabled), .toolbar select')?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <span className="file-name">Untitled document</span>
        <nav className="menubar" aria-label="Menus">
          <FormatMenu editor={editor} />
        </nav>
      </header>
      <Toolbar editor={editor} />
      <main className="workspace" onMouseDown={(e) => {
        // Clicking the gray area around the page puts the cursor at the end, like a real page.
        if (e.target === e.currentTarget) {
          e.preventDefault()
          editor.commands.focus('end')
        }
      }}>
        <div className="sheet">
          <EditorContent editor={editor} />
        </div>
      </main>
      <footer className="statusbar">
        <span>{APP_NAME}</span>
      </footer>
    </div>
  )
}
