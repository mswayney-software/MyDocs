import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [data-item]'

interface PopoverProps {
  /** Accessible name of the trigger button and the panel. */
  label: string
  /** Tooltip; defaults to the label. */
  title?: string
  /** Renders the panel as a menu (arrow keys move between items). */
  menu?: boolean
  className?: string
  trigger: ReactNode
  children: (close: () => void) => ReactNode
}

/** A button that opens a small panel. Closes on outside click, Escape, or when an item calls close(). */
export function Popover({ label, title, menu, className, trigger, children }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])
    items()[0]?.focus()

    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        button.current?.focus()
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
      const list = items()
      if (!list.length || !root.current?.contains(document.activeElement)) return
      e.preventDefault()
      const i = list.indexOf(document.activeElement as HTMLElement)
      const next =
        e.key === 'Home' ? 0
        : e.key === 'End' ? list.length - 1
        : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? (i + 1) % list.length
        : (i - 1 + list.length) % list.length
      list[next].focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={`popover ${className ?? ''}`} ref={root}>
      <button
        ref={button}
        type="button"
        className="tb-btn"
        aria-label={label}
        title={title ?? label}
        aria-haspopup={menu ? 'menu' : 'dialog'}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div id={panelId} className="popover-panel" role={menu ? 'menu' : 'dialog'} aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
