import type { CSSProperties } from 'react'
import type { PageSettings } from '../files/native'
import { PAPER } from '../files/print'

/** CSS variables that size the on-screen sheet like the printed page. */
export function sheetStyle(page: PageSettings): CSSProperties {
  const m = page.margins
  return {
    '--paper-w': PAPER[page.paperSize].width,
    '--paper-h': PAPER[page.paperSize].height,
    '--m-top': `${m.top}in`,
    '--m-right': `${m.right}in`,
    '--m-bottom': `${m.bottom}in`,
    '--m-left': `${m.left}in`,
  } as CSSProperties
}
