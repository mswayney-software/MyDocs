/**
 * Screen appearance, remembered per browser: light, dark, or match the device. It never
 * changes the document, printing or export. Both apps share one origin, so they share it.
 */
export type Theme = 'light' | 'dark' | 'system'

/** Named before MySlides existed; kept so students' saved choice still applies. */
const THEME_KEY = 'mydocs:theme'

/** Read a per-browser setting; null when unset or storage is blocked. */
export function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Save a per-browser setting. Never throws. */
export function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage blocked: the setting resets next time, which is harmless
  }
}

export function loadTheme(): Theme {
  const t = readSetting(THEME_KEY)
  return t === 'dark' || t === 'system' ? t : 'light'
}

const deviceDark = () => window.matchMedia?.('(prefers-color-scheme: dark)')

let stopFollowing: (() => void) | undefined

/** Sets the page's theme now and, for "match my device", whenever the device switches. */
export function applyTheme(theme: Theme) {
  stopFollowing?.()
  stopFollowing = undefined
  const set = () => {
    const dark = theme === 'dark' || (theme === 'system' && !!deviceDark()?.matches)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }
  set()
  const mq = theme === 'system' ? deviceDark() : undefined
  if (mq) {
    mq.addEventListener('change', set)
    stopFollowing = () => mq.removeEventListener('change', set)
  }
}

export function saveTheme(theme: Theme) {
  writeSetting(THEME_KEY, theme)
  applyTheme(theme)
}
