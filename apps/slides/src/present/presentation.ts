import type { DeckSession } from '../deck/session'
import { loadDeckFonts } from './fonts'
import { audienceUrl, openChannel, type ShowChannel } from './channel'
import { sameShow, startAt, stepShow, type ShowAction, type ShowState } from './state'

export type PresentMode =
  | { kind: 'off' }
  /** Present: full screen, this window only. */
  | { kind: 'present'; show: ShowState }
  /** Presenter view: notes here, the slide in the audience's window. */
  | { kind: 'presenter'; show: ShowState; audienceReady: boolean }

/** How often the presenter's window checks that the audience window is still open. */
const WATCH_MS = 500

/**
 * A running presentation, in either mode. Present takes the screen with the browser's full
 * screen; Presenter view opens the audience's window and keeps the two in step over a
 * BroadcastChannel. Closing either window ends it (spec, Architecture).
 */
export class Presentation {
  private mode: PresentMode = { kind: 'off' }
  private listeners = new Set<() => void>()
  private channel: ShowChannel | null = null
  private audience: Window | null = null
  private watch: ReturnType<typeof setInterval> | undefined
  private wentFullscreen = false
  /** Counts presentations, so a late answer from the browser is matched to its own. */
  private runs = 0
  private readonly session: DeckSession

  constructor(session: DeckSession) {
    this.session = session
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = () => this.mode

  get running() {
    return this.mode.kind !== 'off'
  }

  private set(mode: PresentMode) {
    this.mode = mode
    this.listeners.forEach((fn) => fn())
  }

  private count() {
    return this.session.getState().deck.slides.length
  }

  /** Present from slide `index`. Call from a click or key press: full screen needs one. */
  present(index: number) {
    if (this.running) return
    this.wentFullscreen = false
    const el = document.documentElement
    const run = ++this.runs
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen({ navigationUI: 'hide' }).then(
        () => {
          // Ended before the browser got there (Esc pressed at once): leave again.
          if (run === this.runs && this.mode.kind === 'present') this.wentFullscreen = true
          else void document.exitFullscreen().catch(() => {})
        },
        () => {}, // not allowed here (some embedded pages): the slide still fills the window
      )
    }
    document.addEventListener('fullscreenchange', this.onFullscreenChange)
    loadDeckFonts(this.session.getState().deck)
    this.set({ kind: 'present', show: startAt(index) })
  }

  /**
   * Presenter view from slide `index`: opens the audience's window. Call from a click: pop-up
   * blockers allow a window only then. False if the browser blocked it.
   */
  presenterView(index: number): boolean {
    if (this.running) return false
    const token = crypto.randomUUID()
    const channel = openChannel(token, (m) => {
      if (this.mode.kind !== 'presenter') return
      if (m.type === 'hello') {
        // The audience reads the deck from this device's backup, so make sure it's written.
        void this.session.backupNow().then((deckId) => {
          if (this.mode.kind !== 'presenter') return
          channel.send({ type: 'ready', deckId, show: this.mode.show })
          this.set({ ...this.mode, audienceReady: true })
        })
      } else if (m.type === 'show') {
        if (!sameShow(m.show, this.mode.show)) this.set({ ...this.mode, show: m.show })
      } else if (m.type === 'end') {
        this.end(false)
      }
    })
    const win = window.open(audienceUrl(token), `myslides-audience-${token}`, 'popup,width=960,height=600')
    if (!win) {
      channel.close()
      return false
    }
    this.channel = channel
    this.audience = win
    this.watch = setInterval(() => {
      if (this.audience?.closed) this.end(false)
    }, WATCH_MS)
    window.addEventListener('pagehide', this.onPageHide)
    loadDeckFonts(this.session.getState().deck)
    this.set({ kind: 'presenter', show: startAt(index), audienceReady: false })
    return true
  }

  /** A key, click or button: move, blank, or (past the end of Present) finish. */
  act(action: ShowAction) {
    const mode = this.mode
    if (mode.kind === 'off') return
    // Present: moving on from the end screen ends the presentation.
    if (mode.kind === 'present' && action === 'next' && mode.show.ended && !mode.show.blank) return this.end()
    const show = stepShow(mode.show, action, this.count())
    if (show === mode.show) return
    this.set({ ...mode, show })
    this.channel?.send({ type: 'show', show })
  }

  /** Stop presenting. The editor opens on the slide that was showing. */
  end(tellAudience = true) {
    const mode = this.mode
    if (mode.kind === 'off') return
    clearInterval(this.watch)
    // Leaving full screen below finishes later; its event must not end the next presentation.
    this.wentFullscreen = false
    this.runs++
    window.removeEventListener('pagehide', this.onPageHide)
    document.removeEventListener('fullscreenchange', this.onFullscreenChange)
    if (this.channel) {
      if (tellAudience) this.channel.send({ type: 'end' })
      this.channel.close()
      this.channel = null
    }
    if (this.audience && !this.audience.closed) this.audience.close()
    this.audience = null
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    const slide = this.session.getState().deck.slides[Math.min(mode.show.index, this.count() - 1)]
    if (slide) this.session.goTo(slide.id)
    this.set({ kind: 'off' })
  }

  /** Esc leaves full screen in the browser itself, before any key reaches the page. */
  private onFullscreenChange = () => {
    if (!document.fullscreenElement && this.wentFullscreen && this.mode.kind === 'present') this.end()
  }

  private onPageHide = () => this.end()
}
