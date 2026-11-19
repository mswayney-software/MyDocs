import { formatElapsed } from './presenter-settings'
import { actionForKey, startAt, stepShow, type ShowState } from './state'

const run = (s: ShowState, ...actions: Parameters<typeof stepShow>[1][]) => actions.reduce((st, a) => stepShow(st, a, 3), s)

describe('stepping through a presentation', () => {
  it('moves forward to an end screen, and back from it to the last slide', () => {
    expect(run(startAt(0), 'next', 'next')).toEqual(startAt(2))
    expect(run(startAt(0), 'next', 'next', 'next')).toEqual({ index: 2, blank: false, ended: true })
    expect(run(startAt(0), 'next', 'next', 'next', 'next')).toEqual({ index: 2, blank: false, ended: true })
    expect(run(startAt(2), 'next', 'prev')).toEqual(startAt(2))
  })

  it('stops at the first slide', () => {
    const s = startAt(0)
    expect(stepShow(s, 'prev', 3)).toBe(s)
  })

  it('blanks and comes back on the same slide, whichever way the presenter moves', () => {
    expect(run(startAt(1), 'blank')).toEqual({ index: 1, blank: true, ended: false })
    expect(run(startAt(1), 'blank', 'blank')).toEqual(startAt(1))
    expect(run(startAt(1), 'blank', 'next')).toEqual(startAt(1))
    expect(run(startAt(1), 'blank', 'prev')).toEqual(startAt(1))
  })

  it('jumps to the first and last slides', () => {
    expect(run(startAt(1), 'last')).toEqual(startAt(2))
    expect(run(startAt(2), 'next', 'first')).toEqual(startAt(0))
  })

  it('maps the presenting keys, and leaves shortcuts alone', () => {
    expect(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].map((key) => actionForKey({ key }))).toEqual(Array(5).fill('next'))
    expect(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].map((key) => actionForKey({ key }))).toEqual(Array(4).fill('prev'))
    expect(actionForKey({ key: 'b' })).toBe('blank')
    expect(actionForKey({ key: 'Home' })).toBe('first')
    expect(actionForKey({ key: 'r', ctrlKey: true })).toBeNull()
    expect(actionForKey({ key: 'Escape' })).toBeNull()
  })
})

describe('the presenter timer', () => {
  it('reads as minutes and seconds, with hours once it gets there', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(65_400)).toBe('1:05')
    expect(formatElapsed(3_729_000)).toBe('1:02:09')
  })
})
