import { ChevronDown } from 'lucide-react'
import type { DocumentSession } from '../files/session'
import { Popover } from './Popover'
import { shortcutLabel, tooltip } from './shortcuts'

function Item({ label, shortcut, onSelect }: { label: string; shortcut?: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      className="menu-item"
      role="menuitem"
      title={tooltip(label, shortcut)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      <span className="menu-check" aria-hidden="true" />
      <span className="menu-label">{label}</span>
      {shortcut && <span className="menu-shortcut">{shortcutLabel(shortcut)}</span>}
    </button>
  )
}

export function FileMenu({ session, onClosed }: { session: DocumentSession; onClosed: () => void }) {
  return (
    <Popover
      menu
      label="File"
      className="menubar-item"
      onClosed={onClosed}
      trigger={
        <>
          File <ChevronDown size={14} aria-hidden="true" />
        </>
      }
    >
      {(close) => {
        const pick = (fn: () => Promise<unknown>) => () => {
          close()
          void fn()
        }
        return (
          <>
            {/* Ctrl+N is reserved by the browser for a new window, so New has no shortcut. */}
            <Item label="New" onSelect={pick(() => session.newDocument())} />
            <Item label="Open…" shortcut="Mod+O" onSelect={pick(() => session.open())} />
            <div className="menu-sep" role="separator" />
            <Item label="Save" shortcut="Mod+S" onSelect={pick(() => session.save())} />
            <Item label="Save as…" shortcut="Mod+Shift+S" onSelect={pick(() => session.saveAs())} />
          </>
        )
      }}
    </Popover>
  )
}
