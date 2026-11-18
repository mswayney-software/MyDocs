import { offline } from '@mysuite/core/offline'
import { ariaShortcut, shortcutLabel, tooltip } from '@mysuite/core/shortcuts'
import { InstallButton, OfflineStatus, Popover, UpdateButton, useDialogs } from '@mysuite/core/ui'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { DeckSession, type SessionState } from './deck/session'

/**
 * Phase 1: the deck model and files work end to end (new, open, save, save as, backups,
 * recovery). The slide strip lists the deck's slides; drawing them arrives in Phase 2.
 */
export default function App() {
  const [dialog, ask] = useDialogs()
  const [session] = useState(() => new DeckSession(ask))
  const state = useSyncExternalStore(session.subscribe, session.getState)

  useEffect(() => {
    session.start()
    // A new version may apply by itself only while nothing has been done yet.
    offline.setIdleCheck(() => session.isPristine())
    if (import.meta.env.VITE_E2E) window.__mySlides = session
    return () => session.dispose()
  }, [session])

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
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        void (e.shiftKey ? session.saveAs() : session.save())
      } else if (key === 'o' && !e.shiftKey) {
        e.preventDefault()
        void session.open()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [session])

  const slides = state.deck.slides
  return (
    <div className="app">
      <header className="chrome topbar">
        <FileStatus state={state} />
        <nav className="menubar" aria-label="Menus">
          <FileMenu session={session} />
        </nav>
        <UpdateButton />
        <InstallButton appName="MySlides" />
      </header>
      <div className="slides-body">
        <nav className="slide-strip" aria-label="Slides">
          <ol>
            {slides.map((s, i) => (
              <li key={s.id}>
                <span className="strip-num" aria-hidden="true">{i + 1}</span>
                <span className="strip-thumb" aria-hidden="true" />
                <span className="sr-only">Slide {i + 1}</span>
              </li>
            ))}
          </ol>
        </nav>
        <main className="stage" aria-label="Slide editor">
          <div className="slide" role="img" aria-label="Slide 1" />
        </main>
      </div>
      <footer className="statusbar">
        <span className="status-left">
          MySlides · Slide 1 of {slides.length}
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

function FileMenu({ session }: { session: DeckSession }) {
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
        const pick = (fn: () => Promise<unknown>) => () => {
          close()
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
