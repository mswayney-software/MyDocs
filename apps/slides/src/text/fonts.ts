import { FONTS } from '@mysuite/core/fonts'

/**
 * Fonts offered on slides: the MyDocs set (same widths as the fonts schools ask for), plus two
 * theme fonts so decks don't all look like a term paper (spec, decision 7). All bundled.
 */
export const SLIDE_FONTS = [
  ...FONTS,
  { name: 'Atkinson Hyperlegible', label: 'Atkinson Hyperlegible' },
  { name: 'Lora', label: 'Lora' },
] as const
