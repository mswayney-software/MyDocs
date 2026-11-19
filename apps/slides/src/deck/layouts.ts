import { newId } from './newId'
import type { RichText, Slide, TextElement } from './schema'

type VerticalAlign = TextElement['verticalAlign']

interface Placeholder {
  role: string
  x: number
  y: number
  w: number
  h: number
  verticalAlign: VerticalAlign
}

export interface Layout {
  id: string
  name: string
  placeholders: Placeholder[]
}

const TITLE_BAR: Placeholder = { role: 'title', x: 80, y: 40, w: 1120, h: 110, verticalAlign: 'bottom' }

/** The six layouts. Boxes are in slide units (1280 x 720). */
export const LAYOUTS: readonly Layout[] = [
  {
    id: 'title',
    name: 'Title',
    placeholders: [
      { role: 'title', x: 120, y: 220, w: 1040, h: 160, verticalAlign: 'bottom' },
      { role: 'subtitle', x: 120, y: 400, w: 1040, h: 100, verticalAlign: 'top' },
    ],
  },
  {
    id: 'section',
    name: 'Section',
    placeholders: [
      { role: 'title', x: 80, y: 330, w: 1120, h: 140, verticalAlign: 'bottom' },
      { role: 'subtitle', x: 80, y: 490, w: 1120, h: 90, verticalAlign: 'top' },
    ],
  },
  {
    id: 'title-content',
    name: 'Title and content',
    placeholders: [TITLE_BAR, { role: 'body', x: 80, y: 180, w: 1120, h: 480, verticalAlign: 'top' }],
  },
  {
    id: 'two-columns',
    name: 'Two columns',
    placeholders: [
      TITLE_BAR,
      { role: 'body', x: 80, y: 180, w: 540, h: 480, verticalAlign: 'top' },
      { role: 'body2', x: 660, y: 180, w: 540, h: 480, verticalAlign: 'top' },
    ],
  },
  { id: 'title-only', name: 'Title only', placeholders: [TITLE_BAR] },
  { id: 'blank', name: 'Blank', placeholders: [] },
]

export const layoutById = (id: string) => LAYOUTS.find((l) => l.id === id)

const emptyText = (): RichText => ({ type: 'doc', content: [{ type: 'paragraph' }] })

/** True if rich text holds any characters (an empty placeholder holds none). */
export function hasText(node: { text?: unknown; content?: unknown[] } | undefined): boolean {
  if (!node) return false
  if (typeof node.text === 'string' && node.text.length > 0) return true
  return (node.content ?? []).some((c) => hasText(c as { text?: unknown; content?: unknown[] }))
}

/** A new slide with this layout's empty placeholders. */
export function slideWithLayout(layoutId: string): Slide {
  const layout = layoutById(layoutId) ?? LAYOUTS[2]
  return {
    id: newId('s'),
    layout: layout.id,
    background: null,
    transition: 'none',
    notes: '',
    elements: layout.placeholders.map(({ role, x, y, w, h, verticalAlign }) => ({
      id: newId('e'),
      type: 'text' as const,
      role,
      x, y, w, h,
      verticalAlign,
      content: emptyText(),
    })),
  }
}

/**
 * The same slide with another layout. Placeholders the layout has move into place (text kept);
 * missing ones are added empty. Placeholders the layout lacks are removed only if empty: typed
 * text is never thrown away, it stays where it is. Everything else (pictures, shapes, free text
 * boxes) is untouched and stays on top.
 */
export function applyLayout(slide: Slide, layoutId: string): Slide {
  const layout = layoutById(layoutId)
  if (!layout) return slide
  const used = new Set<string>()
  const placed = layout.placeholders.map(({ role, x, y, w, h, verticalAlign }) => {
    const existing = slide.elements.find((e): e is TextElement => e.type === 'text' && e.role === role && !used.has(e.id))
    if (existing) {
      used.add(existing.id)
      return { ...existing, x, y, w, h, verticalAlign }
    }
    return { id: newId('e'), type: 'text' as const, role, x, y, w, h, verticalAlign, content: emptyText() }
  })
  const rest = slide.elements.filter(
    (e) => !used.has(e.id) && !(e.type === 'text' && e.role && !hasText(e.content)),
  )
  return { ...slide, layout: layout.id, elements: [...placed, ...rest] }
}
