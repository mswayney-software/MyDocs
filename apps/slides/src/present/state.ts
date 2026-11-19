/**
 * Where a running presentation is: the slide showing, whether the screen is blanked, and whether
 * it has gone past the last slide. Plain data, so both windows of Presenter view can hold the
 * same state and send it to each other.
 */
export interface ShowState {
  index: number
  /** B: the screen is black. Moving on lifts it first. */
  blank: boolean
  /** Past the last slide: a black "end" screen. */
  ended: boolean
}

export type ShowAction = 'next' | 'prev' | 'first' | 'last' | 'blank'

export const startAt = (index: number): ShowState => ({ index, blank: false, ended: false })

/** The state after one action, in a deck of `count` slides. Unchanged state comes back as is. */
export function stepShow(s: ShowState, action: ShowAction, count: number): ShowState {
  const last = Math.max(0, count - 1)
  switch (action) {
    case 'blank':
      return { ...s, blank: !s.blank }
    case 'next':
      // A blanked screen comes back first, on the same slide.
      if (s.blank) return { ...s, blank: false }
      if (s.ended) return s
      return s.index >= last ? { ...s, ended: true } : { ...s, index: s.index + 1 }
    case 'prev':
      if (s.blank) return { ...s, blank: false }
      if (s.ended) return { ...s, ended: false, index: last }
      return s.index <= 0 ? s : { ...s, index: s.index - 1 }
    case 'first':
      return s.index === 0 && !s.blank && !s.ended ? s : startAt(0)
    case 'last':
      return s.index === last && !s.blank && !s.ended ? s : startAt(last)
  }
}

export const sameShow = (a: ShowState, b: ShowState) => a.index === b.index && a.blank === b.blank && a.ended === b.ended

/**
 * Keys while presenting (spec: arrow keys, space, Page Up and Down move; B blanks). Returns null
 * for keys the presentation leaves alone. Esc is handled by the screen itself.
 */
export function actionForKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): ShowAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Enter':
    case 'n':
    case 'N':
      return 'next'
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
    case 'p':
    case 'P':
      return 'prev'
    case 'Home':
      return 'first'
    case 'End':
      return 'last'
    case 'b':
    case 'B':
    case '.':
      return 'blank'
    default:
      return null
  }
}
