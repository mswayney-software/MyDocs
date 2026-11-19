import { z } from 'zod'

/**
 * The deck file format, defined once. These schemas validate every deck that is opened, give
 * the app its types, and generate docs/deck.schema.json, so the documentation cannot drift
 * from the code. See docs/FILE_FORMAT.md.
 *
 * Objects are "loose": fields this version does not know are kept, and written back on save,
 * so a deck from a newer app (same formatVersion, extra optional fields) survives a round trip.
 */

export const FORMAT_ID = 'myslides'
/** Bump only for changes an older reader would show wrong. Adding optional fields does not. */
export const FORMAT_VERSION = 1
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

/** Limits from the spec. Larger values open fine but are flagged as damaged elements. */
export const LIMITS = { tableRows: 20, tableColumns: 10, chartCategories: 12, chartSeries: 6 } as const

// ---- colors ----------------------------------------------------------------------------

export const THEME_SLOTS = [
  'background', 'text', 'heading', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
] as const
export type ThemeSlot = (typeof THEME_SLOTS)[number]

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'a color like #1F7A8C')
/** A fixed color, a theme slot that follows the theme, or null for none. */
export const color = z
  .union([hex, z.enum(THEME_SLOTS)])
  .nullable()
  .describe('A hex color like "#1F7A8C", a theme slot like "accent1", or null for none')
export type Color = z.infer<typeof color>

// ---- rich text -------------------------------------------------------------------------

/** Every node and mark a text box or table cell may hold. Same JSON the MyDocs editor writes. */
export const TEXT_NODES = ['doc', 'paragraph', 'text', 'hardBreak', 'bulletList', 'orderedList', 'listItem'] as const
export const TEXT_MARKS = ['bold', 'italic', 'underline', 'strike', 'textStyle', 'highlight', 'link'] as const

const attrs = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))

/**
 * Style values (font, color, size) end up in style attributes, so a hand-made file must not
 * smuggle CSS through them. Link addresses are checked separately, by the link rules.
 */
const CSS_BREAKOUT = /[;{}()<>"\\]/
const mark = z
  .looseObject({
    type: z.enum(TEXT_MARKS),
    attrs: attrs.optional(),
  })
  .refine(
    (m) =>
      m.type === 'link' ||
      Object.values(m.attrs ?? {}).every((v) => typeof v !== 'string' || (!CSS_BREAKOUT.test(v) && v.length <= 100)),
    { message: 'style values must be plain' },
  )

export interface TextNode {
  type: (typeof TEXT_NODES)[number]
  text?: string
  attrs?: Record<string, string | number | boolean | null>
  marks?: z.infer<typeof mark>[]
  content?: TextNode[]
  [key: string]: unknown
}

const textNode: z.ZodType<TextNode> = z.lazy(() =>
  z.looseObject({
    type: z.enum(TEXT_NODES),
    text: z.string().optional(),
    attrs: attrs.optional(),
    marks: z.array(mark).optional(),
    content: z.array(textNode).optional(),
  }),
)

/** Rich text: a "doc" node, as the editor produces it. */
export const richText = z
  .looseObject({ type: z.literal('doc'), content: z.array(textNode).optional() })
  .describe('Rich text as editor JSON: paragraphs, lists, links and inline formatting')
export type RichText = z.infer<typeof richText>

// ---- elements --------------------------------------------------------------------------

const unit = z.number().describe('Slide units (the slide is size.width by size.height)')
const elementId = z.string().min(1)
/** Position and size. Files list each element's id and type first, then these. */
const box = {
  x: unit,
  y: unit,
  w: unit.min(0),
  h: unit.min(0),
}

export const textElement = z.looseObject({
  id: elementId,
  type: z.literal('text'),
  /** Placeholder role from the layout ("title", "subtitle", "body"...); absent for free boxes. */
  role: z.string().optional(),
  ...box,
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  content: richText,
})

export const MEDIA_PATH = /^media\/[0-9a-f]{16}\.(jpg|png|webp|gif)$/
export const imageElement = z.looseObject({
  id: elementId,
  type: z.literal('image'),
  ...box,
  src: z.string().regex(MEDIA_PATH, 'a path like media/3fa9c2d1e4b5a6f7.jpg'),
  alt: z.string().default(''),
})

export const SHAPES = ['rect', 'round-rect', 'ellipse', 'triangle', 'line', 'arrow'] as const
export const shapeElement = z.looseObject({
  id: elementId,
  type: z.literal('shape'),
  ...box,
  shape: z.enum(SHAPES),
  fill: color.default(null),
  stroke: color.default(null),
  strokeWidth: z.number().min(0).max(50).default(2),
  /**
   * Lines and arrows run from the top left corner of their box to the bottom right. flipH starts
   * them at the right instead, flipV at the bottom: together, any direction. Arrows point at the end.
   */
  flipH: z.boolean().optional(),
  flipV: z.boolean().optional(),
})

const cell = z.looseObject({
  content: richText,
  fill: color.default(null),
  align: z.enum(['left', 'center', 'right']).default('left'),
})

export const tableElement = z
  .looseObject({
    id: elementId,
    type: z.literal('table'),
    ...box,
    headerRow: z.boolean().default(true),
    columnWidths: z.array(z.number().min(0)).min(1).max(LIMITS.tableColumns),
    rows: z.array(z.looseObject({ cells: z.array(cell) })).min(1).max(LIMITS.tableRows),
  })
  .refine((t) => t.rows.every((r) => r.cells.length === t.columnWidths.length), {
    message: 'every row needs one cell per column',
  })

export const CHART_TYPES = ['bar', 'line', 'pie'] as const
export const chartElement = z
  .looseObject({
    id: elementId,
    type: z.literal('chart'),
    ...box,
    chartType: z.enum(CHART_TYPES),
    title: z.string().default(''),
    alt: z.string().default(''),
    categories: z.array(z.string()).min(1).max(LIMITS.chartCategories),
    series: z
      .array(z.looseObject({ name: z.string(), values: z.array(z.number().nullable()) }))
      .min(1)
      .max(LIMITS.chartSeries),
    options: z
      .looseObject({
        legend: z.boolean().default(true),
        xTitle: z.string().default(''),
        yTitle: z.string().default(''),
      })
      .default({ legend: true, xTitle: '', yTitle: '' }),
  })
  .refine((c) => c.series.every((s) => s.values.length === c.categories.length), {
    message: 'every series needs one value per category',
  })

export const element = z.union([textElement, imageElement, shapeElement, tableElement, chartElement])
export type TextElement = z.infer<typeof textElement>
export type ImageElement = z.infer<typeof imageElement>
export type ShapeElement = z.infer<typeof shapeElement>
export type TableElement = z.infer<typeof tableElement>
export type ChartElement = z.infer<typeof chartElement>

/**
 * In memory only: an element that could not be read. It shows as a labeled placeholder box,
 * and the original JSON is written back unchanged on save, so nothing is lost.
 */
export interface BrokenElement {
  type: 'broken'
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Plain-words reason for the placeholder label. */
  reason: string
  raw: unknown
}

export type Element = z.infer<typeof element> | BrokenElement

// ---- slides, theme, deck ---------------------------------------------------------------

export const TRANSITIONS = ['none', 'fade', 'slide'] as const
export type Transition = (typeof TRANSITIONS)[number]

export const slideSchema = z.looseObject({
  id: z.string().min(1),
  layout: z.string().default('blank'),
  background: color.default(null),
  transition: z.enum(TRANSITIONS).default('none'),
  notes: z.string().default(''),
  /** Read one by one, so a bad element cannot cost the whole slide. */
  elements: z.array(z.unknown()).default([]),
})

export const themeSchema = z.looseObject({
  id: z.string().min(1),
  colors: z.looseObject(Object.fromEntries(THEME_SLOTS.map((s) => [s, hex])) as Record<ThemeSlot, typeof hex>),
  fonts: z.looseObject({ heading: z.string().min(1), body: z.string().min(1) }),
})
export type Theme = z.infer<typeof themeSchema>

export const deckSchema = z
  .looseObject({
    format: z.literal(FORMAT_ID),
    formatVersion: z.int().min(1),
    app: z.looseObject({ name: z.string(), version: z.string() }).optional(),
    meta: z
      .looseObject({
        title: z.string().default(''),
        created: z.string().optional(),
        modified: z.string().optional(),
      })
      .default({ title: '' }),
    size: z
      .looseObject({ width: z.number().positive(), height: z.number().positive() })
      .default({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT }),
    theme: themeSchema,
    slides: z.array(slideSchema).min(1),
  })
  .describe('deck.json: the whole deck. Images live beside it in media/.')

/** The named fields of a loose object type, without its catch-all index signature. */
type Known<T> = { [K in keyof T as string extends K ? never : K]: T[K] }

/** The deck as the app holds it: the file's shape, with elements read (or marked broken). */
export type Slide = Omit<Known<z.infer<typeof slideSchema>>, 'elements'> & { elements: Element[]; [key: string]: unknown }
export type Deck = Omit<Known<z.infer<typeof deckSchema>>, 'slides'> & { slides: Slide[]; [key: string]: unknown }

/** The schema for documentation: slides list their elements by type, not as "unknown". */
export const documentedDeckSchema = deckSchema.safeExtend({
  slides: z.array(slideSchema.safeExtend({ elements: z.array(element) })).min(1),
})
