import { describe, expect, it } from 'vitest'
import { align, distribute, restack } from './arrange'
import { lineEnds } from './geometry'

const slide = { width: 1280, height: 720 }
const a = { id: 'a', x: 100, y: 100, w: 200, h: 100 }
const b = { id: 'b', x: 500, y: 300, w: 100, h: 50 }
const c = { id: 'c', x: 900, y: 150, w: 300, h: 200 }

describe('align', () => {
  it('aligns one item to the slide', () => {
    expect(align([a], 'center', slide).get('a')).toEqual({ x: 540, y: 100 })
    expect(align([a], 'bottom', slide).get('a')).toEqual({ x: 100, y: 620 })
    expect(align([a], 'right', slide).get('a')).toEqual({ x: 1080, y: 100 })
  })

  it('aligns several items to the box around them, reporting only what moves', () => {
    const left = align([a, b, c], 'left', slide)
    expect(left.has('a')).toBe(false)
    expect(left.get('b')).toEqual({ x: 100, y: 300 })
    const middle = align([a, b, c], 'middle', slide) // box spans y 100..350
    expect(middle.get('a')).toEqual({ x: 100, y: 175 })
    expect(middle.get('b')).toEqual({ x: 500, y: 200 })
    expect(middle.get('c')).toEqual({ x: 900, y: 125 })
    expect(align([a, b, c], 'right', slide).get('a')).toEqual({ x: 1000, y: 100 })
  })
})

describe('distribute', () => {
  it('needs three items', () => {
    expect(distribute([a, b], 'horizontal').size).toBe(0)
  })

  it('makes equal gaps, keeping the outer items in place', () => {
    // Span 100..1200, items 600 wide: gaps of 250.
    const m = distribute([c, a, b], 'horizontal')
    expect(m.has('a')).toBe(false)
    expect(m.has('c')).toBe(false)
    expect(m.get('b')).toEqual({ x: 550, y: 300 })
  })

  it('works down the slide too', () => {
    // Span 0..600, three items 100 tall: gaps of 150, so the middle one goes to y 250.
    const top = { id: 't', x: 10, y: 0, w: 50, h: 100 }
    const mid = { id: 'm', x: 20, y: 100, w: 50, h: 100 }
    const low = { id: 'l', x: 30, y: 500, w: 50, h: 100 }
    const m = distribute([low, top, mid], 'vertical')
    expect([...m]).toEqual([['m', { x: 20, y: 250 }]])
  })
})

describe('restack', () => {
  const list = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }))
  const ids = (l: { id: string }[]) => l.map((e) => e.id).join('')

  it('moves to front and back, keeping the selection in order', () => {
    expect(ids(restack(list, new Set(['b', 'd']), 'front'))).toBe('acebd')
    expect(ids(restack(list, new Set(['b', 'd']), 'back'))).toBe('bdace')
  })

  it('moves forward and backward one step past an unselected neighbor', () => {
    expect(ids(restack(list, new Set(['b']), 'forward'))).toBe('acbde')
    expect(ids(restack(list, new Set(['b', 'c']), 'forward'))).toBe('adbce')
    expect(ids(restack(list, new Set(['e']), 'forward'))).toBe('abcde')
    expect(ids(restack(list, new Set(['d']), 'backward'))).toBe('abdce')
    expect(ids(restack(list, new Set(['a']), 'backward'))).toBe('abcde')
  })
})

describe('lineEnds', () => {
  it('runs top left to bottom right unless flipped', () => {
    expect(lineEnds({ w: 100, h: 50 })).toEqual({ from: { x: 0, y: 0 }, to: { x: 100, y: 50 } })
    expect(lineEnds({ w: 100, h: 50, flipH: true })).toEqual({ from: { x: 100, y: 0 }, to: { x: 0, y: 50 } })
    expect(lineEnds({ w: 100, h: 50, flipV: true, flipH: true })).toEqual({ from: { x: 100, y: 50 }, to: { x: 0, y: 0 } })
  })
})
