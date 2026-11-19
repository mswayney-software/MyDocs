import { bounds, MIN_SIZE, resizeBox, snapMove } from './geometry'

const SLIDE = { width: 1280, height: 720 }

describe('moving with snapping', () => {
  test('far from anything, a move is exact', () => {
    expect(snapMove({ x: 100, y: 100, w: 200, h: 100 }, 37, 11, SLIDE, 6)).toEqual({ dx: 37, dy: 11, guides: { x: [], y: [] } })
  })

  test('the left edge snaps to the slide edge, the center to the slide center', () => {
    const r = snapMove({ x: 100, y: 100, w: 200, h: 100 }, -96, 0, SLIDE, 6) // left would be at 4
    expect(r.dx).toBe(-100)
    expect(r.guides.x).toEqual([0])
    const c = snapMove({ x: 0, y: 0, w: 200, h: 100 }, 537, 307, SLIDE, 6) // center at 637, 357
    expect(c).toMatchObject({ dx: 540, dy: 310, guides: { x: [640], y: [360] } })
  })

  test('the right and bottom edges snap too', () => {
    const r = snapMove({ x: 1000, y: 600, w: 200, h: 100 }, 77, 18, SLIDE, 6) // right 1277, bottom 718
    expect(r).toMatchObject({ dx: 80, dy: 20, guides: { x: [1280], y: [720] } })
  })

  test('outside the threshold, nothing snaps', () => {
    expect(snapMove({ x: 100, y: 100, w: 200, h: 100 }, -93, 0, SLIDE, 6).dx).toBe(-93)
  })

  test('bounds wraps several boxes', () => {
    expect(bounds([{ x: 10, y: 20, w: 30, h: 40 }, { x: 100, y: 5, w: 10, h: 10 }])).toEqual({ x: 10, y: 5, w: 100, h: 55 })
  })
})

describe('resizing', () => {
  const b = { x: 100, y: 100, w: 200, h: 100 }

  test('each handle moves only its own edges', () => {
    expect(resizeBox(b, 'e', 50, 999).box).toEqual({ x: 100, y: 100, w: 250, h: 100 })
    expect(resizeBox(b, 'w', 50, 999).box).toEqual({ x: 150, y: 100, w: 150, h: 100 })
    expect(resizeBox(b, 's', 999, 20).box).toEqual({ x: 100, y: 100, w: 200, h: 120 })
    expect(resizeBox(b, 'n', 999, -20).box).toEqual({ x: 100, y: 80, w: 200, h: 120 })
    expect(resizeBox(b, 'nw', -10, -10).box).toEqual({ x: 90, y: 90, w: 210, h: 110 })
    expect(resizeBox(b, 'se', 10, 10).box).toEqual({ x: 100, y: 100, w: 210, h: 110 })
  })

  test('a box never shrinks below the minimum or turns inside out', () => {
    expect(resizeBox(b, 'e', -500, 0).box).toEqual({ x: 100, y: 100, w: MIN_SIZE, h: 100 })
    expect(resizeBox(b, 'w', 500, 0).box).toEqual({ x: 300 - MIN_SIZE, y: 100, w: MIN_SIZE, h: 100 })
  })

  test('keeping proportions follows the edge that moved further', () => {
    expect(resizeBox(b, 'se', 100, 0, { keepRatio: true }).box).toEqual({ x: 100, y: 100, w: 300, h: 150 })
    expect(resizeBox(b, 'nw', -100, 0, { keepRatio: true }).box).toEqual({ x: 0, y: 50, w: 300, h: 150 })
    // Shrinking by a sideways drag on a corner shrinks in proportion (it used to do nothing).
    expect(resizeBox(b, 'se', -100, 0, { keepRatio: true }).box).toEqual({ x: 100, y: 100, w: 100, h: 50 })
    expect(resizeBox(b, 'e', 100, 0, { keepRatio: true }).box).toEqual({ x: 100, y: 75, w: 300, h: 150 })
  })

  test('a dragged edge snaps to the slide edge and shows a guide', () => {
    const r = resizeBox({ x: 1000, y: 100, w: 200, h: 100 }, 'e', 76, 0, { slide: SLIDE, threshold: 6 })
    expect(r.box.w).toBe(280)
    expect(r.guides.x).toEqual([1280])
  })
})
