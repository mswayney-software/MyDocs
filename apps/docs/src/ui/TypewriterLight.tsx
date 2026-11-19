import type { Editor } from '@tiptap/core'
import { useEffect, useRef } from 'react'

/** The word the cursor is in (or just after): its start and end positions in the document. */
function currentWord(editor: Editor) {
  const { $head, head } = editor.state.selection
  const off = $head.parentOffset
  const parent = $head.parent
  const before = parent.textBetween(Math.max(0, off - 80), off, undefined, '￼')
  const after = parent.textBetween(off, Math.min(parent.content.size, off + 80), undefined, '￼')
  return {
    from: head - (/\S*$/.exec(before)?.[0].length ?? 0),
    to: head + (/^\S*/.exec(after)?.[0].length ?? 0),
  }
}

/**
 * A single small light, like an LED, just below the word being typed, shining up: its beam
 * fans out over the word and the lines above it, and the rest of the page stays in shadow.
 * It sits in the page's scrolling area, so it scrolls with the text, and glides from word to
 * word. Screen only: it never prints.
 */
export function TypewriterLight({ editor }: { editor: Editor }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    const wrap = el?.parentElement
    const sheet = wrap?.querySelector<HTMLElement>('.sheet')
    const beam = el?.querySelector<HTMLElement>('.lamp-beam')
    if (!el || !wrap || !sheet || !beam) return
    let frame = 0
    let size = 0 // the beam's reach; it changes only with the line height
    let lastY = NaN
    const place = () => {
      frame = 0
      const view = editor.view
      let caret: { left: number; top: number; bottom: number }
      let left: number
      let right: number
      try {
        caret = view.coordsAtPos(editor.state.selection.head)
        const word = currentWord(editor)
        const start = view.coordsAtPos(word.from)
        const end = view.coordsAtPos(word.to, -1)
        // A word wrapped across lines: light the part on the cursor's line.
        const sameLine = (c: { top: number }) => Math.abs(c.top - caret.top) < 2
        left = sameLine(start) ? start.left : caret.left
        right = sameLine(end) ? end.left : caret.left
      } catch {
        return // the document is being replaced; the next change places the light
      }
      const box = el.getBoundingClientRect()
      const line = Math.max(caret.bottom - caret.top, 8)
      // The LED sits just under the line. The beam fans out from a few lines below it, so at
      // the LED it is already about a word wide, and it widens over the lines above.
      const reach = Math.round(line * 11)
      if (reach !== size) {
        size = reach
        el.style.setProperty('--reach', `${reach}px`)
        el.style.setProperty('--depth', `${Math.round(line * 3)}px`)
      }
      const x = (left + right) / 2 - box.left - reach
      const y = Math.round(caret.bottom - box.top + Math.max(2, line * 0.2) - reach)
      // Glide to a new line; along a line, step with the typing. A glide started on every key
      // costs a slow laptop about 25 ms a keystroke, and each step is only half a letter.
      beam.style.transition = y === lastY ? 'none' : ''
      lastY = y
      beam.style.transform = `translate(${Math.round(x)}px, ${y}px)`
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    schedule()
    editor.on('transaction', schedule)
    window.addEventListener('resize', schedule)
    // Zoom, page setup, images loading and fonts arriving all move the text without a change.
    // The sheet's own size ignores zoom (CSS zoom scales it from outside), so watch the area
    // around it too, which grows with the zoomed page.
    const resized = new ResizeObserver(schedule)
    resized.observe(sheet)
    resized.observe(wrap)
    void document.fonts?.ready.then(schedule)
    return () => {
      cancelAnimationFrame(frame)
      editor.off('transaction', schedule)
      window.removeEventListener('resize', schedule)
      resized.disconnect()
    }
  }, [editor])

  return (
    <div ref={ref} className="typewriter-light" aria-hidden="true">
      <div className="lamp-beam">
        <div className="lamp-shade" />
        <div className="lamp-glow" />
        <div className="lamp-led" />
      </div>
    </div>
  )
}
