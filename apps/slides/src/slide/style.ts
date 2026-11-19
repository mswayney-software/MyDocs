import type { CSSProperties } from 'react'
import { THEME_SLOTS, type Color, type TextElement, type Theme } from '../deck/schema'
import { headerColors, mix } from '../deck/themes'

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

/** Points: table text is a little smaller than body text, so a full table fits. */
export const TABLE_TEXT_PT = 16

/**
 * A table's look, from the theme: body font and text color, lines, and the header row in the
 * first accent with whichever text reads better on it. Theme colors are CSS variables, so cells
 * filled with a theme color (drawn as var(--slot-accent2)) follow a theme switch too.
 */
export function tableStyle(theme: Theme): CSSProperties {
  const head = headerColors(theme)
  const vars: Record<string, string> = {}
  for (const slot of THEME_SLOTS) vars[`--slot-${slot}`] = theme.colors[slot]
  return {
    ...vars,
    '--table-line': mix(theme.colors.text, theme.colors.background, 0.65),
    '--table-head-bg': head.bg,
    '--table-head-fg': head.fg,
    fontFamily: `'${theme.fonts.body}', sans-serif`,
    color: theme.colors.text,
    fontSize: `${TABLE_TEXT_PT}pt`,
    lineHeight: 1.2,
  } as CSSProperties
}
