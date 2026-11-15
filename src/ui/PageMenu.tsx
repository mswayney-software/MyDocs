import { ChevronDown } from 'lucide-react'
import type { DocumentSession } from '../files/session'
import type { Ask } from './dialogTypes'
import { MenuItem, MenuSeparator } from './MenuItem'
import { headerFooter, pageSetup, printDocument } from './pageActions'
import { Popover } from './Popover'

export function PageMenu({ session, ask, onClosed }: { session: DocumentSession; ask: Ask; onClosed: () => void }) {
  return (
    <Popover
      menu
      label="Page"
      className="menubar-item"
      onClosed={onClosed}
      trigger={
        <>
          Page <ChevronDown size={14} aria-hidden="true" />
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
            <MenuItem label="Page setup…" onSelect={pick(() => pageSetup(session, ask))} />
            <MenuItem label="Header, footer and page numbers…" onSelect={pick(() => headerFooter(session, ask))} />
            <MenuSeparator />
            <MenuItem label="Print…" shortcut="Mod+P" onSelect={pick(() => printDocument(session, ask, { pdf: false }))} />
          </>
        )
      }}
    </Popover>
  )
}
