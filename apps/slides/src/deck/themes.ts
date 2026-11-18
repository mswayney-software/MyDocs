import type { Theme } from './schema'

/**
 * The six themes. Each sets the slide background, text and heading colors, six accents (shapes
 * and, from Phase 6, chart series in order), and a heading and body font from the bundled set.
 * Body text and headings meet WCAG AA (4.5:1) on the background; a unit test checks it.
 *
 * Switching theme writes the whole theme into the deck. Colors picked from the theme (slots like
 * "accent1") follow it; colors picked as fixed hex values stay as they are.
 */
export const THEMES: readonly (Theme & { name: string })[] = [
  {
    id: 'plain',
    name: 'Plain',
    colors: {
      background: '#FFFFFF',
      text: '#1F2933',
      heading: '#0B3C5D',
      accent1: '#1F7A8C',
      accent2: '#E07A5F',
      accent3: '#81B29A',
      accent4: '#F2CC8F',
      accent5: '#3D405B',
      accent6: '#9A8C98',
    },
    fonts: { heading: 'Carlito', body: 'Arimo' },
  },
  {
    id: 'harbor',
    name: 'Harbor',
    colors: {
      background: '#F3F7F9',
      text: '#1D2B36',
      heading: '#0E4D64',
      accent1: '#137C8B',
      accent2: '#F28C28',
      accent3: '#5B8E7D',
      accent4: '#B8D8E0',
      accent5: '#2A3D66',
      accent6: '#C05746',
    },
    fonts: { heading: 'Atkinson Hyperlegible', body: 'Atkinson Hyperlegible' },
  },
  {
    id: 'garden',
    name: 'Garden',
    colors: {
      background: '#FBF8F1',
      text: '#2D2A26',
      heading: '#2F5233',
      accent1: '#588157',
      accent2: '#D08C60',
      accent3: '#A3B18A',
      accent4: '#E9C46A',
      accent5: '#6B4E71',
      accent6: '#3A7CA5',
    },
    fonts: { heading: 'Lora', body: 'Atkinson Hyperlegible' },
  },
  {
    id: 'ember',
    name: 'Ember',
    colors: {
      background: '#FFFFFF',
      text: '#292524',
      heading: '#9A3412',
      accent1: '#C2410C',
      accent2: '#0F766E',
      accent3: '#EAB308',
      accent4: '#7C2D12',
      accent5: '#57534E',
      accent6: '#DB2777',
    },
    fonts: { heading: 'Lora', body: 'Arimo' },
  },
  {
    id: 'chalk',
    name: 'Chalk',
    colors: {
      background: '#1F2D2B',
      text: '#E6ECE8',
      heading: '#F4D58D',
      accent1: '#7FC8A9',
      accent2: '#F4A261',
      accent3: '#8EC5FC',
      accent4: '#F4D58D',
      accent5: '#E07A93',
      accent6: '#C3B1E1',
    },
    fonts: { heading: 'Atkinson Hyperlegible', body: 'Arimo' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    colors: {
      background: '#111827',
      text: '#E5E7EB',
      heading: '#FFFFFF',
      accent1: '#60A5FA',
      accent2: '#F472B6',
      accent3: '#34D399',
      accent4: '#FBBF24',
      accent5: '#A78BFA',
      accent6: '#FB7185',
    },
    fonts: { heading: 'Carlito', body: 'Carlito' },
  },
]

export const DEFAULT_THEME = THEMES[0]

/** The theme as stored in a deck: everything but the display name. */
export function themeForDeck(id: string): Theme {
  const { name: _name, ...theme } = THEMES.find((t) => t.id === id) ?? DEFAULT_THEME
  return structuredClone(theme)
}

/** WCAG relative luminance of a #RRGGBB color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two #RRGGBB colors (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Black or white, whichever reads better on this color (for labels drawn over a fill). */
export const inkOn = (hex: string) => (contrast(hex, '#000000') >= contrast(hex, '#FFFFFF') ? '#000000' : '#FFFFFF')
