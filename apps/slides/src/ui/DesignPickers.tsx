import { Popover } from '@mysuite/core/ui'
import { LayoutTemplate, PaintBucket, Palette } from 'lucide-react'
import { useMemo } from 'react'
import type { CanvasController } from '../canvas/controller'
import { applyLayout, LAYOUTS } from '../deck/layouts'
import type { Media } from '../deck/media'
import type { Slide, Theme } from '../deck/schema'
import { THEMES, themeForDeck } from '../deck/themes'
import { SlideView } from '../slide/SlideView'
import { ColorPicker } from './ColorPicker'

const ICON = { size: 18, strokeWidth: 2, 'aria-hidden': true } as const
/** Preview width in screen pixels. */
const PREVIEW_W = 152

function Preview({ slide, theme, media, width }: { slide: Slide; theme: Theme; media: Media; width: number }) {
  const scale = PREVIEW_W / width
  return (
    <span className="design-preview" style={{ width: PREVIEW_W, height: (width * 9 * scale) / 16 }} aria-hidden="true">
      <span className="thumb-scale" style={{ width, height: (width * 9) / 16, transform: `scale(${scale})` }}>
        <SlideView slide={slide} theme={theme} media={media} hints />
      </span>
    </span>
  )
}

/**
 * Layout, theme and background, for the slide in view. Layout and theme show the current slide
 * as it would look with each choice, not just names (spec, UI).
 */
export function DesignPickers({ controller, slide, theme }: { controller: CanvasController; slide: Slide; theme: Theme }) {
  const media = controller.session.getMedia()
  const width = controller.session.getState().deck.size.width
  return (
    <>
      <Popover
        label="Layout"
        menu
        trigger={<LayoutTemplate {...ICON} />}
        title={`Layout: ${LAYOUTS.find((l) => l.id === slide.layout)?.name ?? 'Custom'}`}
      >
        {(close) => <LayoutChoices slide={slide} theme={theme} media={media} width={width} pick={(id) => {
          close()
          controller.setLayout(id)
        }} />}
      </Popover>
      <Popover label="Theme" menu trigger={<Palette {...ICON} />} title={`Theme: ${THEMES.find((t) => t.id === theme.id)?.name ?? theme.id}`}>
        {(close) => <ThemeChoices slide={slide} current={theme.id} media={media} width={width} pick={(id) => {
          close()
          controller.setTheme(id)
        }} />}
      </Popover>
      <ColorPicker
        label="Slide background"
        icon={<PaintBucket {...ICON} />}
        current={slide.background}
        theme={theme}
        noneLabel="Theme background"
        onPick={(c) => controller.setBackground(c)}
      />
    </>
  )
}

function LayoutChoices({ slide, theme, media, width, pick }: {
  slide: Slide
  theme: Theme
  media: Media
  width: number
  pick: (id: string) => void
}) {
  const previews = useMemo(() => LAYOUTS.map((l) => ({ layout: l, slide: applyLayout(slide, l.id) })), [slide])
  return (
    <div className="design-grid">
      {previews.map(({ layout, slide: s }) => (
        <button
          key={layout.id}
          type="button"
          role="menuitemradio"
          aria-checked={slide.layout === layout.id}
          className="design-choice"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(layout.id)}
        >
          <Preview slide={s} theme={theme} media={media} width={width} />
          <span className="design-name">{layout.name}</span>
        </button>
      ))}
    </div>
  )
}

function ThemeChoices({ slide, current, media, width, pick }: {
  slide: Slide
  current: string
  media: Media
  width: number
  pick: (id: string) => void
}) {
  const themes = useMemo(() => THEMES.map((t) => ({ id: t.id, name: t.name, theme: themeForDeck(t.id) })), [])
  return (
    <div className="design-grid">
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          role="menuitemradio"
          aria-checked={current === t.id}
          className="design-choice"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(t.id)}
        >
          <Preview slide={slide} theme={t.theme} media={media} width={width} />
          <span className="design-name">{t.name}</span>
        </button>
      ))}
    </div>
  )
}
