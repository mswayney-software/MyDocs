import { useEffect, useRef } from 'react'
import { actionForKey, type ShowAction } from './state'

/** Keys a focused button acts on itself; the presentation leaves those to it. */
const buttonKey = (e: KeyboardEvent) =>
  (e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement | null)?.closest?.('button')

/** Run `onKey` for the presenting keys, anywhere in the window. */
export function usePresentKeys(onAction: (a: ShowAction) => void, onKey?: (e: KeyboardEvent) => boolean) {
  const latest = useRef({ onAction, onKey })
  useEffect(() => {
    latest.current = { onAction, onKey }
  })
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (latest.current.onKey?.(e)) {
        e.preventDefault()
        return
      }
      if (buttonKey(e)) return
      const action = actionForKey(e)
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      latest.current.onAction(action)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}
