import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createExtensions } from './editor'
import { DocumentSession } from './files/session'
import { InstallButton, OfflineStatus, UpdateButton } from './ui/AppStatus'
import { offline } from './offline'
import { FileMenu } from './ui/FileMenu'
import { FileStatus } from './ui/FileStatus'
import { FindBar } from './ui/FindBar'
import { FormatMenu } from './ui/FormatMenu'
import { PageMenu } from './ui/PageMenu'
import { headerFooter, printDocument } from './ui/pageActions'
import { applyPageStyle } from './files/print'
import { SheetMargin } from './ui/SheetMargins'
import { sheetStyle } from './ui/sheetStyle'
import { ZoomControl } from './ui/ZoomControl'
import { loadZoom, saveZoom } from './ui/zoom'
import { loadLamp, loadTheme, saveLamp, saveTheme, type Theme } from './ui/appearance'
import { TypewriterLight } from './ui/TypewriterLight'
import { ViewMenu } from './ui/ViewMenu'
import { ImageMenu, InsertMenu, TableMenu } from './ui/InsertMenus'
import { editLink, insertImageFiles, syncSelection } from './ui/insertActions'
import { Toolbar } from './ui/Toolbar'
import { useDialogs } from './ui/useDialogs'
import { WordCount } from './ui/WordCount'

export const APP_NAME = 'MyDocs'

const imageFiles = (list: FileList | null | undefined) =>
  Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))

/** Pasted HTML that points at images on the web, which the editor drops (see editor/image.ts). */
const hasWebImages = (html: string) => /<img[^>]+src\s*=\s*["']?(https?:|\/\/)/i.test(html)

export default function App() {
  // The editor's own event handlers need the editor and session, which exist only after this call.
  const editorRef = useRef<Editor | null>(null)
  const sessionRef = useRef<DocumentSession | null>(null)

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
      // Every key acts on the real cursor: the browser reports cursor moves (Home, arrows)
      // a moment late, and a key handled against a stale position can fall through to the
      // browser's own editing, which can move text out of the document.
      handleKeyDown: (view) => {
        ;(view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.()
        return false
      },
      handlePaste: (_view, event) => {
        const ed = editorRef.current
        const files = imageFiles(event.clipboardData?.files)
        if (ed && files.length) {
          void insertImageFiles(ed, files)
          return true
        }
        if (hasWebImages(event.clipboardData?.getData('text/html') ?? '')) {
          sessionRef.current?.notify(
            'Images from web pages were not pasted. Save the image to your computer, then use Insert > Image.',
            8000,
          )
        }
        return false
      },
      handleDrop: (view, event) => {
        const ed = editorRef.current
        const files = imageFiles(event.dataTransfer?.files)
        if (!ed || !files.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        void insertImageFiles(ed, files, pos)
        return true
      },
      // Links don't open on a plain click (that places the cursor); Ctrl+click opens them.
      handleClick: (view, pos, event) => {
        if (!(event.ctrlKey || event.metaKey)) return false
        const link = view.state.doc
          .resolve(pos)
          .marks()
          .find((m) => m.type.name === 'link')
        const href = link?.attrs.href as string | undefined
        if (!href) return false
        window.open(href, '_blank', 'noopener,noreferrer')
        return true
      },
    },
  })
  const [dialog, ask] = useDialogs(() => editorRef.current?.view.focus())
  const [session] = useState(() => new DocumentSession(editor, ask))
  useLayoutEffect(() => {
    editorRef.current = editor
    sessionRef.current = session
  }, [editor, session])
  const file = useSyncExternalStore(session.subscribe, session.getState)
  const [find, setFind] = useState<{ replace: boolean; token: number } | null>(null)
  const findOpen = useRef(false)
  const [zoom, setZoom] = useState(loadZoom)
  const changeZoom = (z: number) => {
    setZoom(z)
    saveZoom(z)
  }
  const [theme, setTheme] = useState(loadTheme)
  const changeTheme = (t: Theme) => {
    setTheme(t)
    saveTheme(t)
  }
  const [lamp, setLamp] = useState(loadLamp)
  const changeLamp = (on: boolean) => {
    setLamp(on)
    saveLamp(on)
  }
  useEffect(() => {
    findOpen.current = find !== null
  }, [find])

  // Focus the page the moment it exists. Tiptap's own autofocus waits a timer plus an
  // animation frame, and keys typed in that gap (on a slow Chromebook, a real gap) are lost.
  useLayoutEffect(() => {
    editor.view.focus()
  }, [editor])

  // The printed page: paper size, margins, header, footer, page numbers.
  useEffect(() => applyPageStyle(file.page), [file.page])

  // A new version applies on its own while the page is blank and untouched.
  useEffect(() => {
    offline.setIdleCheck(() => {
      const s = session.getState()
      return !s.dirty && !s.hasFile && editor.isEmpty
    })
  }, [editor, session])

  useEffect(() => {
    session.start()
    return () => session.dispose()
  }, [session])

  // Installed app launched from a .owdoc in the file manager (Chrome, Edge).
  useEffect(() => {
    const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue
    queue?.setConsumer((params) => {
      const handle = params.files?.[0]
      if (handle && handle.kind === 'file') void session.openLaunchedFile(handle as FileSystemFileHandle)
    })
  }, [session])

  useEffect(() => {
    if (import.meta.env.VITE_E2E) {
      window.__openWriter = editor
      window.__openWriterSession = session
    }
  }, [editor, session])

  // Attached in a layout effect, like the focus above: shortcuts work the moment the cursor shows.
  useLayoutEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      syncSelection(editor)
      // Escape closes the find bar from anywhere, unless a menu is open (it closes the menu).
      if (e.key === 'Escape' && findOpen.current && !document.querySelector('.popover-panel')) {
        e.preventDefault()
        setFind(null)
        editor.view.focus()
        return
      }
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
      // Print through the app, so the student gets the Save as PDF tip and any warnings.
      if (mod && !e.shiftKey && key === 'p') {
        e.preventDefault()
        void printDocument(session, ask, { pdf: false })
        return
      }
      if (mod && !e.shiftKey && key === 'o') {
        e.preventDefault()
        void session.open()
        return
      }
      // Find in the document, not the browser's find (which also searches the toolbar).
      if (mod && !e.shiftKey && (key === 'f' || key === 'h')) {
        e.preventDefault()
        setFind((f) => ({ replace: key === 'h' || (f?.replace ?? false), token: (f?.token ?? 0) + 1 }))
        return
      }
      if (mod && !e.shiftKey && key === 'k') {
        e.preventDefault()
        void editLink(editor, ask)
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
  }, [editor, session, ask])

  const openFind = (replace: boolean) => setFind((f) => ({ replace, token: (f?.token ?? 0) + 1 }))

  return (
    <div className="app">
      {/* One banner landmark for all the controls above the page. */}
      <header className="chrome">
      <div className="topbar">
        <FileStatus state={file} />
        <nav className="menubar" aria-label="Menus">
          <FileMenu session={session} ask={ask} onClosed={() => editor.view.focus()} />
          <InsertMenu editor={editor} ask={ask} />
          <FormatMenu editor={editor} />
          <PageMenu session={session} ask={ask} onClosed={() => editor.view.focus()} />
          <ViewMenu theme={theme} onTheme={changeTheme} lamp={lamp} onLamp={changeLamp} onClosed={() => editor.view.focus()} />
          <TableMenu editor={editor} />
          <ImageMenu editor={editor} />
        </nav>
        <UpdateButton />
        <InstallButton />
      </div>
      <Toolbar editor={editor} onLink={() => void editLink(editor, ask)} onFind={() => openFind(true)} />
      {find && (
        <FindBar editor={editor} replace={find.replace} focusToken={find.token} onClose={() => setFind(null)} />
      )}
      </header>
      <main
        className="workspace"
        onMouseDown={(e) => {
          // Clicking the gray area around the page puts the cursor at the end, like a real page.
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('sheet-wrap')) {
            e.preventDefault()
            editor.commands.focus('end')
          }
        }}
      >
        <div className="sheet-wrap">
        <div className="sheet" style={{ ...sheetStyle(file.page), zoom: zoom / 100 }}>
          <SheetMargin page={file.page} edge="top" onEdit={() => void headerFooter(session, ask)} />
          <EditorContent editor={editor} />
          <SheetMargin page={file.page} edge="bottom" onEdit={() => void headerFooter(session, ask)} />
        </div>
        {lamp && <TypewriterLight editor={editor} />}
        </div>
      </main>
      <footer className="statusbar">
        <span className="status-left">
          <span>{APP_NAME}</span>
          <WordCount editor={editor} />
        </span>
        <span className="status-end">
          <OfflineStatus />
          <ZoomControl zoom={zoom} onZoom={changeZoom} />
        </span>
      </footer>
      {dialog}
    </div>
  )
}
