import { useEffect, useRef, useState } from 'react'
import type { Media } from '../deck/media'
import type { Deck } from '../deck/schema'
import { readBackedUpDeck } from '../deck/session'
import { loadDeckFonts } from './fonts'
import { openChannel, type ShowChannel } from './channel'
import { PresentScreen } from './PresentScreen'
import { stepShow, type ShowAction, type ShowState } from './state'

/** How long to keep knocking before deciding the presentation is gone. */
const GIVE_UP_MS = 10_000

type Phase =
  | { kind: 'waiting' }
  | { kind: 'showing'; deck: Deck; media: Media; show: ShowState }
  | { kind: 'over'; message: string }

/**
 * The audience's window in Presenter view: the slide and nothing else, following the presenter's
 * window (and leading it, when someone presses a key or clicks here). It starts no backups and
 * asks nothing: it only reads the deck the presenter's window backed up.
 */
export function AudienceApp({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'waiting' })
  const [hint, setHint] = useState(true)
  const channel = useRef<ShowChannel | null>(null)

  useEffect(() => {
    document.title = 'Audience - MySlides'
    let loading = false
    let done = false
    const finish = (message: string) => {
      done = true
      setPhase({ kind: 'over', message })
    }
    const ch = openChannel(token, (m) => {
      if (m.type === 'ready' && !loading && !done) {
        loading = true
        void readBackedUpDeck(m.deckId).then(
          (found) => {
            if (!found) return finish('The deck for this presentation could not be found on this device.')
            document.title = `${found.fileName} - Audience - MySlides`
            loadDeckFonts(found.deck)
            setPhase({ kind: 'showing', deck: found.deck, media: found.media, show: m.show })
          },
          () => finish('The deck for this presentation could not be read.'),
        )
      } else if (m.type === 'show') {
        setPhase((p) => (p.kind === 'showing' ? { ...p, show: m.show } : p))
      } else if (m.type === 'end') {
        done = true
        window.close()
        // Still here: this window wasn't opened by the presenter's (reloaded, say).
        finish('The presentation has ended. You can close this window.')
      }
    })
    channel.current = ch
    // The presenter's window may still be getting ready: knock until it answers.
    const started = Date.now()
    ch.send({ type: 'hello' })
    const knock = setInterval(() => {
      if (loading || done) return clearInterval(knock)
      if (Date.now() - started > GIVE_UP_MS) {
        clearInterval(knock)
        finish('This presentation has ended. You can close this window.')
      } else ch.send({ type: 'hello' })
    }, 500)
    // Closing this window ends the session (spec, Architecture).
    const bye = () => {
      if (!done) ch.send({ type: 'end' })
    }
    window.addEventListener('pagehide', bye)
    return () => {
      clearInterval(knock)
      window.removeEventListener('pagehide', bye)
      ch.close()
      channel.current = null
    }
  }, [token])

  // The instructions go once the window is full screen.
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement) setHint(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const fullScreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  if (phase.kind !== 'showing') {
    return (
      <div className="present present-message" role="status">
        <p>{phase.kind === 'waiting' ? 'Opening the presentation…' : phase.message}</p>
      </div>
    )
  }

  const act = (a: ShowAction) => {
    const show = stepShow(phase.show, a, phase.deck.slides.length)
    if (show === phase.show) return
    setPhase({ ...phase, show })
    channel.current?.send({ type: 'show', show })
  }
  return (
    <PresentScreen
      deck={phase.deck}
      media={phase.media}
      show={phase.show}
      onAction={act}
      onExit={() => {
        // Ends the presentation in both windows.
        channel.current?.send({ type: 'end' })
        window.close()
        setPhase({ kind: 'over', message: 'The presentation has ended. You can close this window.' })
      }}
      onKey={(e) => {
        if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return false
        fullScreen()
        return true
      }}
      hint={
        hint && (
          <div className="present-hint">
            <p>
              <strong>This window is for the audience.</strong> Drag it onto the projector’s screen, then press <kbd>F</kbd> for
              full screen.
            </p>
            <div className="present-hint-actions">
              <button type="button" className="dlg-btn dlg-primary" onClick={fullScreen}>
                Full screen (F)
              </button>
              <button type="button" className="dlg-btn" onClick={() => setHint(false)}>
                Hide this
              </button>
            </div>
          </div>
        )
      }
    />
  )
}
