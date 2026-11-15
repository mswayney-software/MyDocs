/**
 * Service worker and install state. Imported first thing in main.tsx so the
 * beforeinstallprompt event, which fires early, is never missed.
 */
export interface OfflineState {
  /** The app and its fonts are cached; it now starts and runs with no network. */
  offlineReady: boolean
  /** A newer version is downloaded and waiting. */
  updateReady: boolean
  /** The browser offers to install the app (Chrome, Edge). */
  canInstall: boolean
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let state: OfflineState = { offlineReady: false, updateReady: false, canInstall: false }
const listeners = new Set<() => void>()
const setState = (patch: Partial<OfflineState>) => {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

export const offline = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  getState: () => state,
  /** Show the browser's install dialog. */
  async install() {
    const e = installEvent
    if (!e) return
    installEvent = null
    setState({ canInstall: false })
    await e.prompt()
  },
  /** Switch to the waiting version. The page reloads; the backup covers anything unsaved. */
  restartToUpdate() {
    void updateSW?.(true)
  },
}

let installEvent: InstallPromptEvent | null = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // we show our own Install button instead of the browser's mini bar
  installEvent = e as InstallPromptEvent
  setState({ canInstall: true })
})
window.addEventListener('appinstalled', () => {
  installEvent = null
  setState({ canInstall: false })
})

let updateSW: ((reload?: boolean) => Promise<void>) | undefined
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Loaded only in production builds: dev and unit tests run without a service worker.
  void import('virtual:pwa-register').then(({ registerSW }) => {
    updateSW = registerSW({
      immediate: true,
      onOfflineReady: () => setState({ offlineReady: true }),
      onNeedRefresh: () => setState({ updateReady: true }),
      onRegisteredSW: (_url, registration) => {
        // Installed on an earlier visit: the app is offline-ready right away.
        if (registration?.active && navigator.serviceWorker.controller) setState({ offlineReady: true })
      },
    })
  })
}
