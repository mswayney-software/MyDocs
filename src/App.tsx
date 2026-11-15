import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { createExtensions } from './editor'
import { DocumentSession } from './files/session'
import { useDialogs } from './ui/useDialogs'
import { FileMenu } from './ui/FileMenu'
import { FileStatus } from './ui/FileStatus'
import { FormatMenu } from './ui/FormatMenu'
import { Toolbar } from './ui/Toolbar'

export const APP_NAME = 'Open Writer'

export default function App() {
  const editor = useEditor({
    extensions: createExtensions(),
    autofocus: false, // focused on mount below; the cursor starts at the top by default
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
  const [dialog, ask] = useDialogs()
  const [session] = useState(() => new DocumentSession(editor, ask))
  const file = useSyncExternalStore(session.subscribe, session.getState)

  // Focus the page the moment it exists. Tiptap's own autofocus waits a timer plus an
  // animation frame, and keys typed in that gap (on a slow Chromebook, a real gap) are lost.
  useLayoutEffect(() => {
    editor.view.focus()
  }, [editor])

  useEffect(() => {
    session.start()
    return () => session.dispose()
  }, [session])

  useEffect(() => {
    if (import.meta.env.VITE_E2E) window.__openWriter = editor
  }, [editor])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey
      const key = e.key.toLowerCase()

      // Alt+F10 moves focus to the toolbar, a common word processor convention.
      if (e.altKey && e.key === 'F10') {
        e.preventDefault()
        document.querySelector<HTMLElement>('.toolbar button:not(:disabled), .toolbar select')?.focus()
        return
      }
      if (mod && key === 's') {
        e.preventDefault() // never the browser's "save this web page"
        void (e.shiftKey ? session.saveAs() : session.save())
        return
      }
      if (mod && !e.shiftKey && key === 'o') {
        e.preventDefault()
        void session.open()
        return
      }
      // Ctrl+A always means "select the whole document", even when focus is on the
      // toolbar or a menu. Without this the browser selects the page around it.
      if (mod && !e.shiftKey && key === 'a') {
        const el = document.activeElement
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
        if (editor.view.dom.contains(el)) return
        e.preventDefault()
        editor.chain().focus().selectAll().run()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor, session])

  return (
    <div className="app">
      <header className="topbar">
        <FileStatus state={file} />
        <nav className="menubar" aria-label="Menus">
          <FileMenu session={session} />
          <FormatMenu editor={editor} />
        </nav>
      </header>
      <Toolbar editor={editor} />
      <main
        className="workspace"
        onMouseDown={(e) => {
          // Clicking the gray area around the page puts the cursor at the end, like a real page.
          if (e.target === e.currentTarget) {
            e.preventDefault()
            editor.commands.focus('end')
          }
        }}
      >
        <div className="sheet">
          <EditorContent editor={editor} />
        </div>
      </main>
      <footer className="statusbar">
        <span>{APP_NAME}</span>
      </footer>
      {dialog}
    </div>
  )
}
