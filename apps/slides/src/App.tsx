import { InstallButton, OfflineStatus, UpdateButton } from '@mysuite/core/ui'
import { useEffect } from 'react'
import { offline } from '@mysuite/core/offline'

/**
 * Phase 0 shell: the editor layout with nothing in it yet. The deck model, slide strip,
 * canvas and menus arrive in Phases 1 and 2.
 */
export default function App() {
  const fileName = 'Untitled deck'

  useEffect(() => {
    document.title = `${fileName} - MySlides`
    // Nothing can be lost yet, so a new version may apply at any time.
    offline.setIdleCheck(() => true)
  }, [])

  return (
    <div className="app">
      <header className="chrome topbar">
        <div className="file-status">
          <h1 className="file-name">{fileName}</h1>
        </div>
        <UpdateButton />
        <InstallButton appName="MySlides" />
      </header>
      <div className="slides-body">
        <nav className="slide-strip" aria-label="Slides">
          <ol>
            <li>
              <span className="strip-num" aria-hidden="true">1</span>
              <span className="strip-thumb" aria-hidden="true" />
              <span className="sr-only">Slide 1, empty</span>
            </li>
          </ol>
        </nav>
        <main className="stage" aria-label="Slide editor">
          <div className="slide" role="img" aria-label="Slide 1 (empty)" />
        </main>
      </div>
      <footer className="statusbar">
        <span className="status-left">MySlides · Slide 1 of 1</span>
        <OfflineStatus />
      </footer>
    </div>
  )
}
