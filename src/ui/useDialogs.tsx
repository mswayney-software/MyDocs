import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { Ask, DialogAnswer, DialogSpec } from './dialogTypes'
import { DialogView } from './DialogView'

interface Pending {
  /** Unique per request, so two identical dialogs in a row are never mistaken for one. */
  id: number
  spec: DialogSpec
  resolve: (a: DialogAnswer) => void
}

/** Promise-based modal dialogs: `const answer = await ask({...})`. One at a time, queued. */
/**
 * `onClosed` runs the moment a dialog closes, before the code that asked continues (which may
 * await storage). Pass the editor's focus, so keys typed right after a dialog are never lost.
 */
export function useDialogs(onClosed?: () => void): [ReactNode, Ask] {
  const [queue, setQueue] = useState<Pending[]>([])
  const nextId = useRef(0)
  const ask = useCallback<Ask>((spec) => {
    const id = ++nextId.current
    return new Promise<DialogAnswer>((resolve) => setQueue((q) => [...q, { id, spec, resolve }]))
  }, [])
  const current = queue[0]
  const element = current ? (
    <DialogView
      key={current.id}
      spec={current.spec}
      onAnswer={(a) => {
        onClosed?.()
        current.resolve(a)
        setQueue((q) => q.filter((p) => p.id !== current.id))
      }}
    />
  ) : null
  return [element, ask]
}
