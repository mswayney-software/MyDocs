import type { Editor, JSONContent } from '@tiptap/core'
import { memo, useEffect, useMemo, useState } from 'react'
import type { Media } from '../deck/media'
import type { RichText, Slide, Theme } from '../deck/schema'
import { SlideView } from '../slide/SlideView'

/** How often, at most, the current slide's thumbnail catches up with typing. */
const LIVE_THUMB_MS = 150

/**
 * One slide, scaled down to `width` screen pixels. Static: no editor, no handlers, and hidden
 * from the keyboard and screen readers (the thumbnail around it carries the label). While a box
 * on it is being edited, it follows the typing.
 */
export const Thumbnail = memo(function Thumbnail({ slide, theme, media, size, width, editor, editingId }: {
  slide: Slide
  theme: Theme
  media: Media
  size: { width: number; height: number }
  width: number
  editor?: Editor | null
  editingId?: string | null
}) {
  return (
    <span
      className="thumb-scale"
      inert
      aria-hidden="true"
      style={{ width: size.width, height: size.height, transform: `scale(${width / size.width})` }}
    >
      {editor && editingId ? (
        <LiveSlideView slide={slide} theme={theme} media={media} editor={editor} editingId={editingId} />
      ) : (
        <SlideView slide={slide} theme={theme} media={media} />
      )}
    </span>
  )
})

/** The current slide while a box on it is being edited: shows the text as typed. */
function LiveSlideView({ slide, theme, media, editor, editingId }: {
  slide: Slide
  theme: Theme
  media: Media
  editor: Editor
  editingId: string
}) {
  const [typed, setTyped] = useState<JSONContent | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onUpdate = () => {
      timer ??= setTimeout(() => {
        timer = undefined
        if (!editor.isDestroyed) setTyped(editor.getJSON())
      }, LIVE_THUMB_MS)
    }
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
      clearTimeout(timer)
      setTyped(null)
    }
  }, [editor])
  const shown = useMemo(
    () =>
      typed
        ? { ...slide, elements: slide.elements.map((e) => (e.id === editingId && e.type === 'text' ? { ...e, content: typed as RichText } : e)) }
        : slide,
    [slide, typed, editingId],
  )
  return <SlideView slide={shown} theme={theme} media={media} />
}
