import type { PageSettings } from '../files/native'
import { marginText } from '../files/print'

/**
 * A light preview of the header or footer in the sheet's margin, as it prints on page 1.
 * Pages themselves appear only when printed (live page view is planned for v2), so this is
 * how the student sees that the header is set. Clicking it opens the header settings.
 */
export function SheetMargin({ page, edge, onEdit }: { page: PageSettings; edge: 'top' | 'bottom'; onEdit: () => void }) {
  const text = marginText(page, 1)
  const cells = (['left', 'center', 'right'] as const).map((a) => text[`${edge}-${a}`] ?? '')
  if (cells.every((c) => !c)) return null
  return (
    <button
      type="button"
      className={`sheet-margin sheet-margin-${edge}`}
      title={edge === 'top' ? 'Header (printed on every page). Click to change.' : 'Footer (printed on every page). Click to change.'}
      aria-label={edge === 'top' ? `Header: ${cells.filter(Boolean).join(', ')}. Change header` : `Footer: ${cells.filter(Boolean).join(', ')}. Change footer`}
      data-testid={`sheet-${edge}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onEdit}
    >
      {cells.map((c, i) => (
        <span key={i} className="sheet-margin-cell">
          {c}
        </span>
      ))}
    </button>
  )
}
