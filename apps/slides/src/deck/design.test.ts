import { describe, expect, it } from 'vitest'
import { newDeck } from './defaults'
import { applyLayout, hasText, LAYOUTS, slideWithLayout } from './layouts'
import { readDeckJson, deckToJson } from './read'
import type { TextElement } from './schema'
import { contrast, headerColors, THEMES, themeForDeck } from './themes'

const text = (s: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: s }] }] })

describe('themes', () => {
  it('has six, each with unique ids and names', () => {
    expect(THEMES).toHaveLength(6)
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(6)
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(6)
  })

  it.each(THEMES.map((t) => [t.name, t] as const))('%s: body text and headings meet WCAG AA (4.5:1) on the background', (_, t) => {
    expect(contrast(t.colors.text, t.colors.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.colors.heading, t.colors.background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(THEMES.map((t) => [t.name, t] as const))('%s: a table header row (first accent) has AA text on it', (_, t) => {
    const { bg, fg } = headerColors(t)
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
    // Still the theme's accent, at most lightly shaded.
    expect(contrast(bg, t.colors.accent1)).toBeLessThan(1.3)
  })

  it('uses only bundled fonts', () => {
    const bundled = ['Tinos', 'Arimo', 'Carlito', 'Atkinson Hyperlegible', 'Lora']
    for (const t of THEMES) expect(bundled).toEqual(expect.arrayContaining([t.fonts.heading, t.fonts.body]))
  })

  it('is written into the deck in full and survives save and reopen', () => {
    const deck = newDeck()
    deck.theme = themeForDeck('chalk')
    const back = readDeckJson(deckToJson(deck), () => false).deck
    expect(back.theme).toEqual(themeForDeck('chalk'))
    expect(back.theme).not.toHaveProperty('name')
  })

  it('computes contrast like WCAG', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2)
  })
})

describe('layouts', () => {
  it('has the six layouts, each placeholder inside the slide', () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual(['title', 'section', 'title-content', 'two-columns', 'title-only', 'blank'])
    for (const l of LAYOUTS)
      for (const p of l.placeholders) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x + p.w).toBeLessThanOrEqual(1280)
        expect(p.y + p.h).toBeLessThanOrEqual(720)
      }
  })

  it('keeps typed text when switching, moves placeholders into place, drops only empty ones', () => {
    const s = slideWithLayout('two-columns')
    const [title, left] = s.elements as TextElement[]
    title.content = text('Plants')
    left.content = text('Roots')
    // right column stays empty
    const free = { id: 'free', type: 'text' as const, x: 10, y: 10, w: 100, h: 50, verticalAlign: 'top' as const, content: text('note') }
    s.elements.push(free)

    const one = applyLayout(s, 'title-content')
    expect(one.layout).toBe('title-content')
    const roles = one.elements.map((e) => (e.type === 'text' ? e.role : e.type))
    expect(roles).toEqual(['title', 'body', undefined]) // empty right column removed, free box kept
    const body = one.elements[1] as TextElement
    expect(body.id).toBe(left.id)
    expect([body.x, body.w]).toEqual([80, 1120])
    expect(hasText(body.content)).toBe(true)

    // Blank: nothing typed is thrown away.
    const blank = applyLayout(one, 'blank')
    expect(blank.elements.map((e) => e.id)).toEqual([title.id, left.id, 'free'])
    // And back: the same boxes return to their places.
    const back = applyLayout(blank, 'two-columns')
    expect(back.elements.slice(0, 2).map((e) => e.id)).toEqual([title.id, left.id])
    expect(back.elements).toHaveLength(4)
  })

  it('does not change the slide for an unknown layout', () => {
    const s = slideWithLayout('title')
    expect(applyLayout(s, 'nope')).toBe(s)
  })
})
