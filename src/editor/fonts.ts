/** Bundled font set. Font files arrive in M3; until then index.css aliases them to local equivalents. */
export const FONTS = ['Liberation Serif', 'Liberation Sans', 'Carlito'] as const
export const DEFAULT_FONT = 'Liberation Serif'

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
