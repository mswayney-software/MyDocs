/**
 * Screen appearance, remembered per browser: light or dark, and the typewriter light that
 * follows the line being written. Neither changes the document, printing or export.
 */
export type Theme = 'light' | 'dark' | 'system'

const THEME_KEY = 'mydocs:theme'
const LAMP_KEY = 'mydocs:lamp'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage blocked: the setting resets next time, which is harmless
  }
}

export function loadTheme(): Theme {
  const t = read(THEME_KEY)
  return t === 'dark' || t === 'system' ? t : 'light'
}

export const loadLamp = () => read(LAMP_KEY) === 'on'
export const saveLamp = (on: boolean) => write(LAMP_KEY, on ? 'on' : 'off')

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
  write(THEME_KEY, theme)
  applyTheme(theme)
}
