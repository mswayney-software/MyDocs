import type { AnyExtension, Extension } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { Color, FontFamily, FontSize } from '@tiptap/extension-text-style'
import { canonicalFont } from '@mysuite/core/fonts'

/** "rgb(192, 0, 0)" -> "#c00000". Anything else is returned lowercased and trimmed. */
export function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (!v) return null
  const m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (!m) return v
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null // fully transparent
  return '#' + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')
}

/** '"Times New Roman", serif' -> 'Tinos': first family, unquoted, mapped to a bundled equivalent. */
export function normalizeFontFamily(value: string): string | null {
  // Pasted text often carries a stack ("Calibri, sans-serif"); the first family is the intended one.
  const first = value.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? ''
  return first ? canonicalFont(first) : null
}

type Normalizer = (value: string) => string | null

/**
 * Wraps a text-style extension so the values it reads back from HTML match the values
 * the toolbar writes. Without this, pasted or imported text gets "" and rgb() values,
 * and identical-looking text carries different data.
 */
function normalized(ext: Extension, attr: string, cssProp: 'color' | 'fontFamily' | 'fontSize', fn: Normalizer): AnyExtension {
  return ext.extend({
    addGlobalAttributes() {
      const parent = this.parent?.() ?? []
      return parent.map((group) => {
        const spec = group.attributes[attr]
        if (!spec) return group
        return {
          ...group,
          attributes: {
            ...group.attributes,
            [attr]: { ...spec, parseHTML: (el: HTMLElement) => fn(el.style[cssProp]) },
          },
        }
      })
    },
  })
}

export const NormalizedColor = normalized(Color, 'color', 'color', normalizeColor)
export const NormalizedFontFamily = normalized(FontFamily, 'fontFamily', 'fontFamily', normalizeFontFamily)
export const NormalizedFontSize = normalized(FontSize, 'fontSize', 'fontSize', (v) => v.trim() || null)

/** Highlight with its color read back as hex, for the same reason as above. */
export const NormalizedHighlight = Highlight.extend({
  addAttributes() {
    const parent = this.parent?.() ?? {}
    if (!parent.color) return parent
    return {
      ...parent,
      color: {
        ...parent.color,
        parseHTML: (el: HTMLElement) => normalizeColor(el.getAttribute('data-color') || el.style.backgroundColor || ''),
      },
    }
  },
}).configure({ multicolor: true })
