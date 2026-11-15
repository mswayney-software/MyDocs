import { Download } from 'lucide-react'
import type { DocumentSession } from '../files/session'
import type { Ask } from './dialogTypes'
import { MenuItem } from './MenuItem'
import { printDocument } from './pageActions'
import { Popover } from './Popover'

/** The top bar's Export button: the document as a Word file or a PDF, in plain words. */
export function ExportMenu({ session, ask, onClosed }: { session: DocumentSession; ask: Ask; onClosed: () => void }) {
  return (
    <Popover
      menu
      label="Export"
      className="menubar-item export-menu"
      onClosed={onClosed}
      trigger={
        <>
          <Download size={15} aria-hidden="true" /> Export
        </>
      }
    >
      {(close) => (
        <>
          <MenuItem
            label="Save as Word file (.docx)…"
            onSelect={() => {
              close()
              void session.exportWord()
            }}
          />
          <MenuItem
            label="Save as PDF…"
            onSelect={() => {
              close()
              void printDocument(session, ask, { pdf: true })
            }}
          />
        </>
      )}
    </Popover>
  )
}
