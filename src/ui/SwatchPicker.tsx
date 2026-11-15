import type { ReactNode } from 'react'
import { Popover } from './Popover'

interface SwatchPickerProps {
  label: string
  title: string
  icon: ReactNode
  /** Color shown as the bar under the icon. */
  current: string | null
  colors: readonly { name: string; value: string }[]
  /** Label of the "remove" choice, such as "Automatic" or "No highlight". */
  noneLabel: string
  onPick: (value: string | null) => void
}

export function SwatchPicker({ label, title, icon, current, colors, noneLabel, onPick }: SwatchPickerProps) {
  return (
    <Popover
      label={label}
      title={title}
      trigger={
        <span className="swatch-trigger">
          {icon}
          <span className="swatch-bar" style={{ background: current ?? 'transparent' }} />
        </span>
      }
    >
      {(close) => (
        <div className="swatches">
          <button
            type="button"
            data-item
            className="swatch-none"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onPick(null)
              close()
            }}
          >
            {noneLabel}
          </button>
          <div className="swatch-grid">
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                data-item
                className="swatch"
                style={{ background: c.value }}
                aria-label={c.name}
                title={c.name}
                aria-pressed={current?.toLowerCase() === c.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(c.value)
                  close()
                }}
              />
            ))}
          </div>
        </div>
      )}
    </Popover>
  )
}
