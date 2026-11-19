import { offline } from '@mysuite/core/offline'
import { ariaShortcut, shortcutLabel, tooltip } from '@mysuite/core/shortcuts'
import { InstallButton, OfflineStatus, Popover, UpdateButton, useDialogs } from '@mysuite/core/ui'
import { ChevronDown, LayoutGrid, Play } from 'lucide-react'
import { pickImageFile } from '@mysuite/core/images'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Canvas } from './canvas/Canvas'
import { CanvasController } from './canvas/controller'
import { DeckSession, type SessionState } from './deck/session'
import { Presentation } from './present/presentation'
import { PresenterView } from './present/PresenterView'
import { PresentScreen } from './present/PresentScreen'
import { SorterView } from './sorter/SorterView'
import { ChartDialog } from './ui/ChartDialog'
import { NotesPane } from './ui/NotesPane'
import { SlideStrip } from './ui/SlideStrip'
import { editLinkDialog } from './ui/link'
import { Toolbar } from './ui/Toolbar'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))

export default function App() {
  const [dialog, ask] = useDialogs()
  const [session] = useState(() => new DeckSession(ask))
  const [controller] = useState(() => new CanvasController(session))
  const [presentation] = useState(() => new Presentation(session))
  const mode = useSyncExternalStore(presentation.subscribe, presentation.getState)
  const pendingPaste = useRef(false)
  const state = useSyncExternalStore(session.subscribe, session.getState)
  const ui = useSyncExternalStore(controller.subscribe, controller.getState)
  // The sorter belongs to one deck: one put in place by New or Open starts in the editor.
  const [sorterFor, setSorterFor] = useState<number | null>(null)
  const view = sorterFor === state.generation ? 'sorter' : 'editor'

  const openSorter = useCallback(() => {
    controller.clearSelection()
    setSorterFor(session.getState().generation)
  }, [controller, session])
  const closeSorter = useCallback(() => {
    setSorterFor(null)
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.stage')?.focus())
  }, [])

  // Present from the start or from this slide; Presenter view opens the audience's window. All
  // from a click or key press: full screen and a second window need one.
  const present = useCallback(
    (from: 'start' | 'here') => {
      controller.finishEditing()
      controller.endNotes()
      const here = session.getState().deck.slides.indexOf(session.currentSlide())
      presentation.present(from === 'start' ? 0 : Math.max(0, here))
    },
    [controller, session, presentation],
  )
  const presenterView = useCallback(() => {
    controller.finishEditing()
    controller.endNotes()
    if (presentation.presenterView(0)) return
    void ask({
      title: 'The audience window was blocked',
      body: 'The browser stopped MySlides from opening a second window. Allow pop-ups for this page (look for the blocked pop-up sign in the address bar), then choose Presenter view again.',
      buttons: [{ label: 'OK', value: 'ok', primary: true }],
      cancelValue: 'ok',
    })
  }, [controller, presentation, ask])
  // Back from presenting: the keyboard goes to the slide.
  const presenting = mode.kind !== 'off'
  const wasPresenting = useRef(false)
  useEffect(() => {
    if (wasPresenting.current && !presenting) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.stage, .grid-sorter [aria-current="true"]')?.focus())
    }
    wasPresenting.current = presenting
  }, [presenting])

  useEffect(() => {
    session.start()
    // A new version may apply by itself only while nothing has been done yet, and never
    // mid-presentation (spec: nothing interrupts a running presentation).
    offline.setIdleCheck(() => session.isPristine() && !presentation.running)
    if (import.meta.env.VITE_E2E) {
      window.__mySlides = session
      window.__mySlidesCanvas = controller
      window.__mySlidesPresent = presentation
    }
    return () => {
      presentation.end()
      session.dispose()
    }
  }, [session, controller, presentation])

  // Pictures come from the Picture button, pasting, or dropping a file on the slide.
  const addPicture = useCallback(
    async (file: File, at?: { x: number; y: number }) => {
      try {
        await controller.insertPicture(file, at)
      } catch {
        await ask({
          title: 'That file can’t be used as a picture',
          body: 'Use a photo or picture file: JPEG, PNG, WebP or GIF.',
          buttons: [{ label: 'OK', value: 'ok', primary: true }],
          cancelValue: 'ok',
        })
      }
    },
    [controller, ask],
  )
  const pickPicture = useCallback(async () => {
    const file = await pickImageFile()
    if (file) await addPicture(file)
  }, [addPicture])

  // Paste: a picture on the clipboard becomes a picture on the slide; otherwise the app's own
  // copied items are pasted (Ctrl+V on the canvas lets this event through for that reason).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (presentation.running) return e.preventDefault()
      // Some browsers list clipboard files under items rather than files.
      const files = [
        ...(e.clipboardData?.files ?? []),
        ...[...(e.clipboardData?.items ?? [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()),
      ]
      const picture = files.find((f): f is File => !!f && f.type.startsWith('image/'))
      if (picture) {
        e.preventDefault()
        void addPicture(picture)
        return
      }
      if (isTyping(e.target)) return
      e.preventDefault()
      pendingPaste.current = false
      controller.paste()
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [controller, addPicture, presentation])

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
      if (!handle || handle.kind !== 'file') return
      const openIt = () => void session.openLaunchedFile(handle as FileSystemFileHandle)
      // Mid-presentation it waits: opening may ask about unsaved changes.
      if (!presentation.running) return openIt()
      const stop = presentation.subscribe(() => {
        if (presentation.running) return
        stop()
        openIt()
      })
    })
  }, [session, presentation])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Presenting: the presentation has the keyboard.
      if (presentation.running || document.querySelector('dialog[open]')) return
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey
      const key = e.key.toLowerCase()
      const { editingId, editor, selected } = controller.getState()

      // F5 presents from the start, Shift+F5 from this slide (never the browser's reload).
      if (e.key === 'F5' && !mod && !e.altKey) {
        e.preventDefault()
        present(e.shiftKey ? 'here' : 'start')
        return
      }

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
      // The sorter handles its own keys.
      if (view === 'sorter') {
        if (mod && (key === 'z' || key === 'y') && !isTyping(e.target)) {
          e.preventDefault()
          if (key === 'y' || e.shiftKey) controller.redo()
          else controller.undo()
        }
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
      else if (mod && key === 'v') {
        // Let the browser's paste event through: it may carry a picture (handled above). If it
        // doesn't come (some browsers skip it with nothing to type into), paste our own items.
        pendingPaste.current = true
        setTimeout(() => {
          if (pendingPaste.current) controller.paste()
          pendingPaste.current = false
        }, 50)
        return
      }
      else if (mod && key === 'd') controller.duplicate()
      else if (e.key === 'PageDown') controller.step(1)
      else if (e.key === 'PageUp') controller.step(-1)
      else if (!selected.length) handled = false
      else if (e.key in arrows && !mod) controller.nudge(...arrows[e.key])
      else if (e.key === 'Delete' || e.key === 'Backspace') controller.deleteSelected()
      else if (e.key === 'Escape') controller.clearSelection()
      else if ((e.key === 'Enter' || e.key === 'F2') && one?.type === 'text') controller.startEditing(one.id, 'end')
      else if ((e.key === 'Enter' || e.key === 'F2') && one?.type === 'chart') controller.openChart(one.id)
      else if ((e.key === 'Enter' || e.key === 'F2') && one?.type === 'table') controller.startEditing(one.id, 'start')
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
  }, [session, controller, ask, view, presentation, present])

  const slide = session.currentSlide()
  const index = state.deck.slides.indexOf(slide)
  const deck = state.deck
  return (
    <>
      {mode.kind === 'present' && (
        <PresentScreen
          deck={deck}
          media={session.getMedia()}
          show={mode.show}
          onAction={(a) => presentation.act(a)}
          onExit={() => presentation.end()}
          onKey={(e) => {
            if (e.key !== 'Escape') return false
            presentation.end()
            return true
          }}
        />
      )}
      {mode.kind === 'presenter' && (
        <PresenterView
          deck={deck}
          media={session.getMedia()}
          show={mode.show}
          audienceReady={mode.audienceReady}
          onAction={(a) => presentation.act(a)}
          onEnd={() => presentation.end()}
        />
      )}
    {/* While presenting, the editor stays as it was, out of sight. */}
    <div className="app" style={presenting ? { display: 'none' } : undefined}>
      <header className="chrome">
        <div className="topbar">
          <FileStatus state={state} />
          <nav className="menubar" aria-label="Menus">
            <FileMenu session={session} controller={controller} />
          </nav>
          <UpdateButton />
          <InstallButton appName="MySlides" />
          <PresentButton onPresent={present} onPresenterView={presenterView} />
        </div>
        {view === 'editor' && (
          <Toolbar controller={controller} ask={ask} theme={state.deck.theme} onInsertPicture={() => void pickPicture()} />
        )}
      </header>
      {view === 'sorter' ? (
        <main className="slides-body sorter-body" aria-label="Slide sorter">
          <SorterView controller={controller} onClose={closeSorter} />
        </main>
      ) : (
        <div className="slides-body">
          <SlideStrip controller={controller} />
          <main className="editor-area" aria-label="Slide editor">
            <Canvas
              controller={controller}
              slide={slide}
              theme={state.deck.theme}
              media={session.getMedia()}
              size={state.deck.size}
              onDropPicture={(file, at) => void addPicture(file, at)}
            />
            <NotesPane controller={controller} />
          </main>
        </div>
      )}
      <footer className="statusbar">
        <span className="status-left">
          MySlides · Slide {index + 1} of {state.deck.slides.length}
          {ui.selected.length > 1 ? ` · ${ui.selected.length} selected` : ''}
        </span>
        <span className="status-right">
          <button
            type="button"
            className="status-btn"
            aria-pressed={view === 'sorter'}
            title={view === 'sorter' ? 'Back to editor (Escape)' : 'Slide sorter: every slide at once'}
            onClick={view === 'sorter' ? closeSorter : openSorter}
          >
            <LayoutGrid size={14} aria-hidden="true" /> Slide sorter
          </button>
          <OfflineStatus />
        </span>
      </footer>
      {ui.chart && (
        <ChartDialog
          key={ui.chart.id ?? 'new'}
          initial={controller.chartToEdit()}
          isNew={!ui.chart.id}
          theme={state.deck.theme}
          onApply={(c) => {
            controller.applyChart(c)
            requestAnimationFrame(() => document.querySelector<HTMLElement>('.stage')?.focus())
          }}
          onCancel={() => {
            controller.closeChart()
            requestAnimationFrame(() => document.querySelector<HTMLElement>('.stage')?.focus())
          }}
        />
      )}
      {dialog}
    </div>
    </>
  )
}

/** Present (from the start), with a menu for the other ways to present. Two clicks at most. */
function PresentButton({ onPresent, onPresenterView }: { onPresent: (from: 'start' | 'here') => void; onPresenterView: () => void }) {
  return (
    <span className="present-split">
      <button
        type="button"
        className="present-btn"
        title={tooltip('Present from the beginning', 'F5')}
        aria-keyshortcuts="F5"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPresent('start')}
      >
        <Play size={16} aria-hidden="true" /> Present
      </button>
      <Popover menu label="More ways to present" className="present-more" trigger={<ChevronDown size={16} aria-hidden="true" />}>
        {(close) => (
          <>
            <Item label="Present from the beginning" shortcut="F5" onSelect={() => { close(); onPresent('start') }} />
            <Item label="Present from this slide" shortcut="Shift+F5" onSelect={() => { close(); onPresent('here') }} />
            <div className="menu-sep" role="separator" />
            <Item label="Presenter view (notes on this screen)" onSelect={() => { close(); onPresenterView() }} />
          </>
        )}
      </Popover>
    </span>
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
