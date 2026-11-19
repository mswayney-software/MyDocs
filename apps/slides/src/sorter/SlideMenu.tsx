import { ariaShortcut, shortcutLabel } from '@mysuite/core/shortcuts'
import { useEffect, useRef } from 'react'

const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }
/** "Ctrl+ArrowUp" reads better as "Ctrl+↑". */
const keyLabel = (shortcut: string) => shortcutLabel(shortcut).replace(/Arrow(Up|Down|Left|Right)/, (k) => ARROWS[k])

export interface SlideMenuAction {
  label: string
  shortcut?: string
  disabled?: boolean
  run: () => void
}

/** The slide menu (right-click or the Menu key on a thumbnail): add, duplicate, move, delete. */
export function SlideMenu({ x, y, actions, onClose }: { x: number; y: number; actions: SlideMenuAction[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [onClose])
  // Keep the menu on screen near the bottom and right edges.
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - 40 * actions.length - 16)
  return (
    <div
      ref={ref}
      className="popover-panel strip-menu"
      role="menu"
      aria-label="Slide"
      style={{ position: 'fixed', left: Math.max(4, left), top: Math.max(4, top) }}
      onKeyDown={(e) => {
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLElement)
        if (e.key === 'Escape' || e.key === 'Tab') onClose()
        else if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus()
        else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus()
        else if (e.key === 'Home') items[0]?.focus()
        else if (e.key === 'End') items.at(-1)?.focus()
        else return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          role="menuitem"
          className="menu-item"
          disabled={a.disabled}
          title={a.shortcut ? `${a.label} (${keyLabel(a.shortcut)})` : a.label}
          aria-keyshortcuts={a.shortcut ? ariaShortcut(a.shortcut) : undefined}
          onClick={() => {
            a.run()
            onClose()
          }}
        >
          <span className="menu-check" aria-hidden="true" />
          <span className="menu-label">{a.label}</span>
          {a.shortcut && (
            <span className="menu-shortcut" aria-hidden="true">
              {keyLabel(a.shortcut)}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
