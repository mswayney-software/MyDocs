import { ChevronDown } from 'lucide-react'
import type { Theme } from './appearance'
import { MenuItem, MenuSeparator, Popover } from '@mysuite/core/ui'

interface ViewMenuProps {
  theme: Theme
  onTheme: (t: Theme) => void
  lamp: boolean
  onLamp: (on: boolean) => void
  onClosed: () => void
}

const THEMES: [Theme, string][] = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['system', 'Match my device'],
]

/** How the app looks on screen. The printed page is always black on white. */
export function ViewMenu({ theme, onTheme, lamp, onLamp, onClosed }: ViewMenuProps) {
  return (
    <Popover
      menu
      label="View"
      className="menubar-item"
      onClosed={onClosed}
      trigger={
        <>
          View <ChevronDown size={14} aria-hidden="true" />
        </>
      }
    >
      {(close) => (
        <>
          {THEMES.map(([value, label]) => (
            <MenuItem
              key={value}
              label={label}
              radio
              checked={theme === value}
              onSelect={() => {
                onTheme(value)
                close()
              }}
            />
          ))}
          <MenuSeparator />
          <MenuItem
            label="Typewriter light"
            checked={lamp}
            onSelect={() => {
              onLamp(!lamp)
              close()
            }}
          />
        </>
      )}
    </Popover>
  )
}
