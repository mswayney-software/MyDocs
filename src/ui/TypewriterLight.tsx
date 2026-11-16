import type { Editor } from '@tiptap/core'
import { useEffect, useRef } from 'react'

/**
 * A soft band of light on the line being written, with the rest of the page in shadow, like a
 * lamp over a typewriter. It sits in the page's scrolling area, so it scrolls with the text,
 * and glides to the cursor's line after every change. Screen only: it never prints.
 */
export function TypewriterLight({ editor }: { editor: Editor }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    const wrap = el?.parentElement
    const sheet = wrap?.querySelector<HTMLElement>('.sheet')
    if (!el || !wrap || !sheet) return
    let frame = 0
    const place = () => {
      frame = 0
      let line: { top: number; bottom: number }
      try {
        line = editor.view.coordsAtPos(editor.state.selection.head)
      } catch {
        return // the document is being replaced; the next change places the light
      }
      const box = wrap.getBoundingClientRect()
      const page = sheet.getBoundingClientRect()
      const lineHeight = Math.max(line.bottom - line.top, 8)
      // The light fades out over a line or two above and below, so the lines around it glow faintly.
      const fade = lineHeight * 1.6
      // Whole pixels: at a fractional edge the band and its shadow leave a hairline of light.
      const px = Math.round
      el.style.setProperty('--fade', `${px(fade)}px`)
      el.style.width = `${px(page.width)}px`
      el.style.height = `${px(lineHeight + 2 * fade)}px`
      el.style.transform = `translate(${px(page.left - box.left)}px, ${px(line.top - box.top - fade)}px)`
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    schedule()
    editor.on('transaction', schedule)
    window.addEventListener('resize', schedule)
    // Zoom, page setup, images loading and fonts arriving all move the line without a change.
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

  return <div ref={ref} className="typewriter-light" aria-hidden="true" />
}
