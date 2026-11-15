import { ChevronDown } from 'lucide-react'
import type { DocumentSession } from '../files/session'
import type { Ask } from './dialogTypes'
import { printDocument } from './pageActions'
import { newFromTemplate } from './templateActions'
import { Popover } from './Popover'
import { ariaShortcut, shortcutLabel, tooltip } from './shortcuts'

function Item({ label, shortcut, onSelect }: { label: string; shortcut?: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      className="menu-item"
      role="menuitem"
      title={tooltip(label, shortcut)}
      aria-keyshortcuts={shortcut ? ariaShortcut(shortcut) : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      <span className="menu-check" aria-hidden="true" />
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

export function FileMenu({ session, ask, onClosed }: { session: DocumentSession; ask: Ask; onClosed: () => void }) {
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
            <Item label="New from template…" onSelect={pick(() => newFromTemplate(session, ask))} />
            <Item label="Open…" shortcut="Mod+O" onSelect={pick(() => session.open())} />
            <div className="menu-sep" role="separator" />
            <Item label="Save" shortcut="Mod+S" onSelect={pick(() => session.save())} />
            <Item label="Save as…" shortcut="Mod+Shift+S" onSelect={pick(() => session.saveAs())} />
            <div className="menu-sep" role="separator" />
            <Item label="Print…" shortcut="Mod+P" onSelect={pick(() => printDocument(session, ask, { pdf: false }))} />
            <Item label="Save as Word file (.docx)…" onSelect={pick(() => session.exportWord())} />
            <Item label="Save as PDF…" onSelect={pick(() => printDocument(session, ask, { pdf: true }))} />
          </>
        )
      }}
    </Popover>
  )
}
