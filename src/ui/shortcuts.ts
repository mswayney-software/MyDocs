const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** "Mod+Shift+B" -> "Ctrl+Shift+B" (or the Mac equivalent) for tooltips. */
export function shortcutLabel(shortcut: string): string {
  return isMac
    ? shortcut.replace(/Mod\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥')
    : shortcut.replace(/Mod\+/g, 'Ctrl+')
}

export function tooltip(label: string, shortcut?: string): string {
  return shortcut ? `${label} (${shortcutLabel(shortcut)})` : label
}
