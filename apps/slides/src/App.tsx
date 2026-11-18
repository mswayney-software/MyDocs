import { offline } from '@mysuite/core/offline'
import { ariaShortcut, shortcutLabel, tooltip } from '@mysuite/core/shortcuts'
import { InstallButton, OfflineStatus, Popover, UpdateButton, useDialogs } from '@mysuite/core/ui'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Canvas } from './canvas/Canvas'
import { CanvasController } from './canvas/controller'
import { DeckSession, type SessionState } from './deck/session'
import { SlideStrip } from './ui/SlideStrip'
import { editLinkDialog } from './ui/link'
import { Toolbar } from './ui/Toolbar'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))

export default function App() {
  const [dialog, ask] = useDialogs()
  const [session] = useState(() => new DeckSession(ask))
  const [controller] = useState(() => new CanvasController(session))
  const state = useSyncExternalStore(session.subscribe, session.getState)
  const ui = useSyncExternalStore(controller.subscribe, controller.getState)

  useEffect(() => {
    session.start()
    // A new version may apply by itself only while nothing has been done yet.
    offline.setIdleCheck(() => session.isPristine())
    if (import.meta.env.VITE_E2E) {
      window.__mySlides = session
      window.__mySlidesCanvas = controller
    }
    return () => session.dispose()
  }, [session, controller])

  // A new deck opens with the cursor ready in the title (spec, UI). Only when a deck is put
  // in place: undoing back to an empty deck must not grab the keyboard.
  useEffect(() => {
    if (!session.isPristine()) return
    const title = session.getState().deck.slides[0].elements.find((e) => e.type === 'text' && e.role === 'title')
    if (title) controller.startEditing(title.id)
  }, [session, controller, state.generation])

  // Installed app opened with a deck from the file manager (Chrome and Edge).
  useEffect(() => {
    const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue
    queue?.setConsumer((params) => {
      const handle = params.files[0]
      if (handle && handle.kind === 'file') void session.openLaunchedFile(handle as FileSystemFileHandle)
    })
  }, [session])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey
      const key = e.key.toLowerCase()
      const { editingId, editor, selected } = controller.getState()

      // Anywhere, even while typing.
      if (mod && key === 's') {
        e.preventDefault() // never the browser's "save this web page"
        controller.finishEditing()
        void (e.shiftKey ? session.saveAs() : session.save())
        return
      }
      if (mod && !e.shiftKey && key === 'o') {
        e.preventDefault()
        controller.finishEditing()
        void session.open()
        return
      }
      if (mod && !e.shiftKey && key === 'm') {
        e.preventDefault()
        controller.addSlide()
        return
      }

      // While a text box is being edited, keys belong to the editor (Ctrl+Z included).
      if (editingId && editor && (e.target as HTMLElement | null)?.closest?.('.ProseMirror')) {
        if (e.key === 'Escape') {
          e.preventDefault()
          controller.finishEditing()
          document.querySelector<HTMLElement>('.stage')?.focus()
        } else if (mod && !e.shiftKey && key === 'k') {
          e.preventDefault()
          void editLinkDialog(editor, ask)
        }
        return
      }
      // A box is being edited but its editor doesn't have the keyboard yet: the key goes in the box.
      if (editingId && !mod && e.key.length === 1 && !isTyping(e.target) && controller.typeIntoEditing(e.key)) {
        e.preventDefault()
        return
      }
      // Undo and redo work from the strip and toolbar too (right after deleting a slide, say).
      const inChrome = (e.target as HTMLElement | null)?.closest?.('.slide-strip, .toolbar')
      if (inChrome && !isTyping(e.target) && mod && (key === 'z' || key === 'y')) {
        e.preventDefault()
        if (key === 'y' || e.shiftKey) controller.redo()
        else controller.undo()
        return
      }
      // In the strip, menus, the toolbar's fields: their own keys.
      if (isTyping(e.target) || (e.target as HTMLElement | null)?.closest?.('.slide-strip, .popover-panel, .toolbar')) return

      const one = selected.length === 1 ? session.currentSlide().elements.find((x) => x.id === selected[0]) : undefined
      const step = e.shiftKey ? 10 : 1
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      }
      let handled = true
      if (mod && !e.shiftKey && key === 'z') controller.undo()
      else if (mod && (key === 'y' || (e.shiftKey && key === 'z'))) controller.redo()
      else if (mod && key === 'a') controller.selectAll()
      else if (mod && key === 'c') controller.copy()
      else if (mod && key === 'x') controller.cut()
      else if (mod && key === 'v') controller.paste()
      else if (mod && key === 'd') controller.duplicate()
      else if (e.key === 'PageDown') controller.step(1)
      else if (e.key === 'PageUp') controller.step(-1)
      else if (!selected.length) handled = false
      else if (e.key in arrows && !mod) controller.nudge(...arrows[e.key])
      else if (e.key === 'Delete' || e.key === 'Backspace') controller.deleteSelected()
      else if (e.key === 'Escape') controller.clearSelection()
      else if ((e.key === 'Enter' || e.key === 'F2') && one?.type === 'text') controller.startEditing(one.id, 'end')
      else if (e.key === 'Tab' && (e.target as HTMLElement | null)?.classList?.contains('stage')) controller.cycle(e.shiftKey ? -1 : 1)
      // Typing a letter on a selected text box starts editing it, with that letter.
      else if (one?.type === 'text' && !mod && e.key.length === 1) controller.startEditing(one.id, { char: e.key })
      else handled = false
      if (!handled && e.key === 'Tab' && (e.target as HTMLElement | null)?.classList?.contains('stage') && !e.shiftKey) {
        controller.cycle(1)
        handled = true
      }
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [session, controller, ask])

  const slide = session.currentSlide()
  const index = state.deck.slides.indexOf(slide)
  return (
    <div className="app">
      <header className="chrome">
        <div className="topbar">
          <FileStatus state={state} />
          <nav className="menubar" aria-label="Menus">
            <FileMenu session={session} controller={controller} />
          </nav>
          <UpdateButton />
          <InstallButton appName="MySlides" />
        </div>
        <Toolbar controller={controller} ask={ask} theme={state.deck.theme} />
      </header>
      <div className="slides-body">
        <SlideStrip controller={controller} />
        <main className="editor-area" aria-label="Slide editor">
          <Canvas controller={controller} slide={slide} theme={state.deck.theme} media={session.getMedia()} size={state.deck.size} />
        </main>
      </div>
      <footer className="statusbar">
        <span className="status-left">
          MySlides · Slide {index + 1} of {state.deck.slides.length}
          {ui.selected.length > 1 ? ` · ${ui.selected.length} selected` : ''}
        </span>
        <OfflineStatus />
      </footer>
      {dialog}
    </div>
  )
}

/** File name, then whether it is saved, in plain words. */
function FileStatus({ state }: { state: SessionState }) {
  const status = state.dirty ? 'Unsaved changes' : state.hasFile ? 'Saved' : null
  const hint = state.dirty ? `Backed up on this device. Press ${shortcutLabel('Mod+S')} to save to a file.` : undefined
  return (
    <div className="file-status">
      {/* The deck's name is the page's main heading. */}
      <h1 className="file-name">{state.fileName}</h1>
      {/* Announced to screen readers when it changes. */}
      <span className="file-state" role="status" aria-live="polite" title={hint}>
        {state.notice ?? status}
      </span>
    </div>
  )
}

function Item({ label, shortcut, onSelect }: { label: string; shortcut?: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      className="menu-item"
      role="menuitem"
      title={tooltip(label, shortcut)}
      aria-keyshortcuts={shortcut ? ariaShortcut(shortcut) : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      <span className="menu-check" aria-hidden="true" />
      <span className="menu-label">{label}</span>
      {shortcut && (
        <span className="menu-shortcut" aria-hidden="true">
          {shortcutLabel(shortcut)}
        </span>
      )}
    </button>
  )
}

function FileMenu({ session, controller }: { session: DeckSession; controller: CanvasController }) {
  return (
    <Popover
      menu
      label="File"
      className="menubar-item"
      trigger={
        <>
          File <ChevronDown size={14} aria-hidden="true" />
        </>
      }
    >
      {(close) => {
        // Text being typed goes into the deck before any file action.
        const pick = (fn: () => Promise<unknown>) => () => {
          close()
          controller.finishEditing()
          void fn()
        }
        return (
          <>
            {/* Ctrl+N is reserved by the browser for a new window, so New has no shortcut. */}
            <Item label="New" onSelect={pick(() => session.newDeck())} />
            <Item label="Open…" shortcut="Mod+O" onSelect={pick(() => session.open())} />
            <div className="menu-sep" role="separator" />
            <Item label="Save" shortcut="Mod+S" onSelect={pick(() => session.save())} />
            <Item label="Save as…" shortcut="Mod+Shift+S" onSelect={pick(() => session.saveAs())} />
          </>
        )
      }}
    </Popover>
  )
}
