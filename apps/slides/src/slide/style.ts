import type { CSSProperties } from 'react'
import type { Color, TextElement, Theme } from '../deck/schema'

/** A color from the file: hex as is, a theme slot through the theme, null as none. */
export function resolveColor(color: Color | undefined, theme: Theme): string | undefined {
  if (!color) return undefined
  return color.startsWith('#') ? color : (theme.colors[color as keyof Theme['colors']] as string | undefined)
}

/** Default look of text by placeholder role. Points; the slide is 1280 units = 13.333 in. */
export function textDefaults(role: string | undefined, theme: Theme) {
  if (role === 'title') return { font: theme.fonts.heading, color: theme.colors.heading, size: 40, lineHeight: 1.1 }
  if (role === 'subtitle') return { font: theme.fonts.body, color: theme.colors.text, size: 24, lineHeight: 1.2 }
  return { font: theme.fonts.body, color: theme.colors.text, size: 20, lineHeight: 1.2 }
}

/** Box style shared by the static text and the live editor, so both lay text out the same. */
export function textBoxStyle(el: TextElement, theme: Theme): CSSProperties {
  const d = textDefaults(el.role, theme)
  return {
    fontFamily: `'${d.font}', sans-serif`,
    color: d.color,
    fontSize: `${d.size}pt`,
    lineHeight: d.lineHeight,
    justifyContent: el.verticalAlign === 'middle' ? 'center' : el.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
  }
}

const HINTS: Record<string, string> = { title: 'Click to add title', subtitle: 'Click to add subtitle' }
export const placeholderHint = (role: string | undefined) => HINTS[role ?? ''] ?? 'Click to add text'
