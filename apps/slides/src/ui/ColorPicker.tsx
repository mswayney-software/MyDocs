import { Popover } from '@mysuite/core/ui'
import type { ReactNode } from 'react'
import type { Color, Theme } from '../deck/schema'
import { resolveColor } from '../slide/style'
import { colorName, STANDARD_COLORS, THEME_CHOICES } from './colors'

export function ColorPicker({ label, icon, current, theme, noneLabel, onPick }: {
  label: string
  icon: ReactNode
  current: Color
  theme: Theme
  /** Label of the "no color" choice ("No fill", "Theme background"...). */
  noneLabel: string
  onPick: (color: Color) => void
}) {
  const swatch = (value: Color, name: string, close: () => void) => (
    <button
      key={value ?? 'none'}
      type="button"
      data-item
      className="swatch"
      style={{ background: resolveColor(value, theme) }}
      aria-label={name}
      title={name}
      aria-pressed={current === value}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onPick(value)
        close()
      }}
    />
  )
  return (
    <Popover
      label={label}
      title={`${label}: ${current ? colorName(current) : noneLabel}`}
      trigger={
        <span className="swatch-trigger">
          {icon}
          <span className="swatch-bar" style={{ background: resolveColor(current, theme) ?? 'transparent' }} />
        </span>
      }
    >
      {(close) => (
        <div className="swatches">
          <button
            type="button"
            data-item
            className="swatch-none"
            aria-pressed={current === null}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onPick(null)
              close()
            }}
          >
            {noneLabel}
          </button>
          <div className="swatch-heading">Theme colors</div>
          <div className="swatch-grid">{THEME_CHOICES.map((c) => swatch(c.slot, c.name, close))}</div>
          <div className="swatch-heading">Standard colors</div>
          <div className="swatch-grid">{STANDARD_COLORS.map((c) => swatch(c.value, c.name, close))}</div>
        </div>
      )}
    </Popover>
  )
}
