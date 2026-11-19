import { describe, expect, it } from 'vitest'
import { slideWithLayout } from '../deck/layouts'
import { cellAt, columnsFor, contentHeight, copySlide, gapAt, gapForStep, moveToGap, rangeIds, visibleRange, type Grid } from './order'

const list = 'abcdefgh'.split('').map((id) => ({ id }))
const ids = (l: { id: string }[]) => l.map((s) => s.id).join('')
const set = (s: string) => new Set(s.split(''))

describe('moveToGap', () => {
  it('moves one slide earlier and later', () => {
    expect(ids(moveToGap(list, set('e'), 1))).toBe('aebcdfgh')
    expect(ids(moveToGap(list, set('b'), 6))).toBe('acdefbgh')
    expect(ids(moveToGap(list, set('b'), 8))).toBe('acdefghb')
    expect(ids(moveToGap(list, set('h'), 0))).toBe('habcdefg')
  })

  it('dropping next to itself changes nothing', () => {
    expect(ids(moveToGap(list, set('c'), 2))).toBe('abcdefgh')
    expect(ids(moveToGap(list, set('c'), 3))).toBe('abcdefgh')
  })

  it('gathers slides that were apart, in deck order', () => {
    expect(ids(moveToGap(list, set('bf'), 4))).toBe('acdbfegh')
    expect(ids(moveToGap(list, set('gb'), 0))).toBe('bgacdefh')
  })
})

describe('gapForStep', () => {
  const move = (chosen: string, delta: number) => ids(moveToGap(list, set(chosen), gapForStep(list, set(chosen), delta)))
  it('moves one place, or a row, either way', () => {
    expect(move('d', -1)).toBe('abdcefgh')
    expect(move('d', 1)).toBe('abcedfgh')
    expect(move('f', -4)).toBe('afbcdegh')
    expect(move('b', 4)).toBe('acdefbgh')
  })
  it('stops at the ends', () => {
    expect(move('a', -1)).toBe('abcdefgh')
    expect(move('h', 1)).toBe('abcdefgh')
    expect(move('c', -10)).toBe('cabdefgh')
    expect(move('c', 10)).toBe('abdefghc')
  })
  it('moves a run of slides as a block', () => {
    expect(move('cd', 1)).toBe('abecdfgh')
    expect(move('cd', -1)).toBe('acdbefgh')
  })
})

describe('rangeIds', () => {
  it('runs either way', () => {
    expect(rangeIds(list, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeIds(list, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(rangeIds(list, 'gone', 'c')).toEqual(['c'])
  })
})

describe('copySlide', () => {
  it('gives the copy and its elements new ids and keeps everything else', () => {
    const slide = slideWithLayout('title')
    slide.notes = 'Say hello'
    const copy = copySlide(slide)
    expect(copy.id).not.toBe(slide.id)
    expect(copy.elements.map((e) => e.id)).not.toContain(slide.elements[0].id)
    expect(copy.notes).toBe('Say hello')
    expect({ ...copy, id: 0, elements: copy.elements.map((e) => ({ ...e, id: 0 })) }).toEqual({
      ...slide,
      id: 0,
      elements: slide.elements.map((e) => ({ ...e, id: 0 })),
    })
  })
})

describe('grid geometry', () => {
  const strip: Grid = { count: 60, cols: 1, cellW: 160, cellH: 90, padX: 8, padY: 12 }
  const grid: Grid = { count: 10, cols: 4, cellW: 260, cellH: 180, padX: 20, padY: 20 }

  it('places cells and sizes the scroll area', () => {
    expect(cellAt(grid, 5)).toEqual({ x: 280, y: 200 })
    expect(contentHeight(strip)).toBe(24 + 60 * 90)
    expect(columnsFor(1100, 260, 20)).toBe(4)
    expect(columnsFor(100, 260, 20)).toBe(1)
  })

  it('draws only the rows on screen, plus a margin', () => {
    expect(visibleRange(strip, 0, 600, 2)).toEqual([0, 9])
    const [from, to] = visibleRange(strip, 2700, 600, 2)
    expect(from).toBe(27)
    expect(to).toBe(39)
    expect(visibleRange(strip, 99999, 600)[1]).toBe(60)
    expect(visibleRange(grid, 0, 400, 0)).toEqual([0, 10])
  })

  it('finds the gap under the pointer', () => {
    // Strip: nearest boundary between thumbnails.
    expect(gapAt(strip, 50, 12 + 90 * 3 + 30).gap).toBe(3)
    expect(gapAt(strip, 50, 12 + 90 * 3 + 60).gap).toBe(4)
    expect(gapAt(strip, 50, -100).gap).toBe(0)
    expect(gapAt(strip, 50, 99999).gap).toBe(60)
    // Grid: the row under the pointer, the nearest boundary across it.
    expect(gapAt(grid, 20 + 260 * 1.4, 20 + 180 * 1.5)).toEqual({ gap: 5, row: 1, col: 1 })
    expect(gapAt(grid, 20 + 260 * 3.9, 20 + 10)).toEqual({ gap: 4, row: 0, col: 4 })
    // The last row has two slides: the gap after them is the end.
    expect(gapAt(grid, 2000, 20 + 180 * 2.5)).toEqual({ gap: 10, row: 2, col: 2 })
  })
})
