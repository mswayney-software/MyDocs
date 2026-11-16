import { Check } from 'lucide-react'
import { ariaShortcut, shortcutLabel, tooltip } from './shortcuts'

interface MenuItemProps {
  label: string
  shortcut?: string
  /** Set for on/off items; leave undefined for plain actions. */
  checked?: boolean
  /** One choice of several (with checked): announced as a radio item. */
  radio?: boolean
  disabled?: boolean
  onSelect: () => void
}

export function MenuItem({ label, shortcut, checked, radio, disabled, onSelect }: MenuItemProps) {
  return (
    <button
      type="button"
      className="menu-item"
      role={checked === undefined ? 'menuitem' : radio ? 'menuitemradio' : 'menuitemcheckbox'}
      aria-checked={checked}
      disabled={disabled}
      title={tooltip(label, shortcut)}
      aria-keyshortcuts={shortcut ? ariaShortcut(shortcut) : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      <span className="menu-check" aria-hidden="true">{checked && <Check size={14} />}</span>
      <span className="menu-label">{label}</span>
      {/* Read out through aria-keyshortcuts, so the item's name is just its label. */}
      {shortcut && (
        <span className="menu-shortcut" aria-hidden="true">
          {shortcutLabel(shortcut)}
        </span>
      )}
    </button>
  )
}

export const MenuSeparator = () => <div className="menu-sep" role="separator" />
