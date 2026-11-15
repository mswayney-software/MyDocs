/**
 * Bundled fonts (SIL OFL 1.1, from Fontsource; cached by the service worker for offline use).
 * Each one has the same character widths as the font schools usually ask for, so line and
 * page breaks match a paper written in that font.
 */
export const FONTS = [
  { name: 'Tinos', label: 'Tinos (Times New Roman)' },
  { name: 'Arimo', label: 'Arimo (Arial)' },
  { name: 'Carlito', label: 'Carlito (Calibri)' },
] as const
export type FontName = (typeof FONTS)[number]['name']
export const DEFAULT_FONT: FontName = 'Tinos'

/**
 * Names used before M3 (the spec's original Liberation fonts, which share Tinos and Arimo's
 * design and widths), plus the fonts ours stand in for, so pasted text keeps its look.
 */
const FONT_ALIASES: Record<string, FontName> = {
  'liberation serif': 'Tinos',
  'times new roman': 'Tinos',
  times: 'Tinos',
  'liberation sans': 'Arimo',
  arial: 'Arimo',
  helvetica: 'Arimo',
  calibri: 'Carlito',
}

/** Map a font name to a bundled font where there is an equivalent; anything else is kept as is. */
export function canonicalFont(name: string): string {
  return FONT_ALIASES[name.trim().toLowerCase()] ?? name.trim()
}

/** Points. */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72] as const
export const DEFAULT_FONT_SIZE = 12

export const TEXT_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Dark gray', value: '#595959' },
  { name: 'Red', value: '#c00000' },
  { name: 'Orange', value: '#c55a11' },
  { name: 'Green', value: '#00804a' },
  { name: 'Blue', value: '#1f4e9e' },
  { name: 'Purple', value: '#7030a0' },
] as const

/** Limited to colors a .docx highlight can represent exactly. */
export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#ffff00' },
  { name: 'Green', value: '#00ff00' },
  { name: 'Cyan', value: '#00ffff' },
  { name: 'Pink', value: '#ff00ff' },
  { name: 'Gray', value: '#d3d3d3' },
] as const
