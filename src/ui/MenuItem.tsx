import { Check } from 'lucide-react'
import { shortcutLabel, tooltip } from './shortcuts'

interface MenuItemProps {
  label: string
  shortcut?: string
  /** Set for on/off items; leave undefined for plain actions. */
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
}

export function MenuItem({ label, shortcut, checked, disabled, onSelect }: MenuItemProps) {
  return (
    <button
      type="button"
      className="menu-item"
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      disabled={disabled}
      title={tooltip(label, shortcut)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      <span className="menu-check" aria-hidden="true">{checked && <Check size={14} />}</span>
      <span className="menu-label">{label}</span>
      {shortcut && <span className="menu-shortcut">{shortcutLabel(shortcut)}</span>}
    </button>
  )
}

export const MenuSeparator = () => <div className="menu-sep" role="separator" />
