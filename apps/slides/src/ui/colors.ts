import type { Color, ThemeSlot } from '../deck/schema'

/** Theme colors follow the theme when it changes; standard colors stay fixed. */
export const THEME_CHOICES: { slot: ThemeSlot; name: string }[] = [
  { slot: 'background', name: 'Background' },
  { slot: 'text', name: 'Text' },
  { slot: 'heading', name: 'Heading' },
  { slot: 'accent1', name: 'Accent 1' },
  { slot: 'accent2', name: 'Accent 2' },
  { slot: 'accent3', name: 'Accent 3' },
  { slot: 'accent4', name: 'Accent 4' },
  { slot: 'accent5', name: 'Accent 5' },
  { slot: 'accent6', name: 'Accent 6' },
]

export const STANDARD_COLORS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Light gray', value: '#D9D9D9' },
  { name: 'Gray', value: '#808080' },
  { name: 'Black', value: '#000000' },
  { name: 'Red', value: '#C00000' },
  { name: 'Orange', value: '#E36C09' },
  { name: 'Yellow', value: '#FFC000' },
  { name: 'Green', value: '#00804A' },
  { name: 'Blue', value: '#1F4E9E' },
  { name: 'Purple', value: '#7030A0' },
] as const

/** The plain-words name of a color as stored, for labels and screen readers. */
export function colorName(color: Color): string {
  if (!color) return 'None'
  return (
    THEME_CHOICES.find((c) => c.slot === color)?.name ??
    STANDARD_COLORS.find((c) => c.value.toLowerCase() === color.toLowerCase())?.name ??
    color
  )
}
