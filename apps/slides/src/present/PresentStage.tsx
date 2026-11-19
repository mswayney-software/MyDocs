import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Media } from '../deck/media'
import type { Deck, Slide } from '../deck/schema'
import { pictureUrl } from '../slide/pictures'
import { SlideView } from '../slide/SlideView'
import type { ShowState } from './state'

/** Spec, Architecture: transitions are CSS opacity and transform only, 250 ms. */
export const TRANSITION_MS = 250

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Decode the pictures of the slides about to come, so showing one never waits for a picture
 * (spec: the presenter preloads the next slide's images). The decoded images are held here,
 * a few slides' worth, so the browser keeps them ready.
 */
function usePreload(slides: Slide[], media: Media) {
  const held = useRef(new Map<string, HTMLImageElement>())
  useEffect(() => {
    const want = new Set<string>()
    for (const slide of slides)
      for (const el of slide.elements) {
        const url = el.type === 'image' ? pictureUrl(media.get(el.src)) : undefined
        if (url) want.add(url)
      }
    const map = held.current
    for (const url of want) {
      if (map.has(url)) continue
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      img.decode().catch(() => {}) // a broken picture shows as broken; nothing to do here
      map.set(url, img)
    }
    for (const url of [...map.keys()]) if (!want.has(url)) map.delete(url)
  }, [slides, media])
}

/**
 * The slide being presented, scaled to fill its box with black bars as needed. The slides on
 * either side are drawn too, out of sight, so moving to one shows a slide that is already
 * built: the move costs one frame, then its transition (fade or slide) runs.
 */
export function PresentStage({ deck, media, show, animate = true, label }: {
  deck: Deck
  media: Media
  show: ShowState
  /** Play slide transitions (the audience's screen); off for the presenter's previews. */
  animate?: boolean
  /** Accessible name; the slide's own text is read inside it. */
  label?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ scale: 0, left: 0, top: 0 })
  const { width, height } = deck.size
  const count = deck.slides.length
  const index = Math.min(show.index, count - 1)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      const scale = Math.min(r.width / width, r.height / height)
      setFit({ scale, left: (r.width - width * scale) / 2, top: (r.height - height * scale) / 2 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width, height])

  // The slide that is leaving, while the arriving one's transition runs.
  const [view, setView] = useState<{ index: number; from: number | null }>({ index, from: null })
  if (view.index !== index) {
    const kind = deck.slides[index]?.transition ?? 'none'
    setView({ index, from: animate && kind !== 'none' && !reducedMotion() ? view.index : null })
  }

  const layers = useRef(new Map<string, HTMLDivElement>())
  useLayoutEffect(() => {
    if (view.from === null) return
    const incoming = layers.current.get(deck.slides[view.index]?.id)
    const outgoing = layers.current.get(deck.slides[view.from]?.id)
    if (!incoming) return
    const forward = view.index > view.from
    const timing = { duration: TRANSITION_MS, easing: 'ease-out' }
    const running: Animation[] = []
    for (const el of [incoming, outgoing]) el?.getAnimations().forEach((a) => a.cancel())
    if (deck.slides[view.index].transition === 'fade') {
      running.push(incoming.animate([{ opacity: 0 }, { opacity: 1 }], timing))
    } else {
      const off = forward ? '100%' : '-100%'
      running.push(incoming.animate([{ transform: `translateX(${off})` }, { transform: 'none' }], timing))
      if (outgoing) {
        const away = forward ? '-100%' : '100%'
        running.push(outgoing.animate([{ transform: 'none' }, { transform: `translateX(${away})` }], timing))
      }
    }
    const landed = view.index
    void Promise.all(running.map((a) => a.finished)).then(
      () => setView((v) => (v.index === landed ? { ...v, from: null } : v)),
      () => {}, // cancelled by the next move, which takes over
    )
    return () => running.forEach((a) => a.cancel())
  }, [view, deck.slides])

  // Built ahead of time, just after the current slide shows: the ones either side.
  const near = useDeferredValue(index)
  const drawn = new Set([index, ...(view.from !== null ? [view.from] : []), ...[near - 1, near + 1].filter((i) => i >= 0 && i < count)])
  const preload = deck.slides.slice(near + 1, near + 3)
  usePreload(preload, media)

  const visible = (i: number) => i === index || i === view.from
  return (
    <div ref={box} className="present-stage" role="region" aria-roledescription="slide" aria-label={label} data-shown={show.ended ? 'end' : index}>
      {fit.scale > 0 && (
        <div
          className="present-frame"
          style={{ left: fit.left, top: fit.top, width: width * fit.scale, height: height * fit.scale }}
        >
          {[...drawn].sort((a, b) => a - b).map((i) => {
            const slide = deck.slides[i]
            return (
              <div
                key={slide.id}
                ref={(el) => {
                  if (el) layers.current.set(slide.id, el)
                  else layers.current.delete(slide.id)
                }}
                className="present-layer"
                data-index={i}
                aria-hidden={i !== index}
                style={{ visibility: visible(i) ? 'visible' : 'hidden', zIndex: i === index ? 2 : 1 }}
              >
                <span className="present-scale" style={{ width, height, transform: `scale(${fit.scale})` }}>
                  <SlideView slide={slide} theme={deck.theme} media={media} />
                </span>
              </div>
            )
          })}
        </div>
      )}
      {show.ended && (
        <div className="present-cover present-end">
          <p>End of presentation</p>
        </div>
      )}
      {show.blank && !show.ended && <div className="present-cover" aria-label="Screen blanked" role="img" />}
    </div>
  )
}
