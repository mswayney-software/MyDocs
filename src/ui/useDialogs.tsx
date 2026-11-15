import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { Ask, DialogAnswer, DialogSpec } from '../files/session'
import { DialogView } from './DialogView'

interface Pending {
  /** Unique per request, so two identical dialogs in a row are never mistaken for one. */
  id: number
  spec: DialogSpec
  resolve: (a: DialogAnswer) => void
}

/** Promise-based modal dialogs: `const answer = await ask({...})`. One at a time, queued. */
export function useDialogs(): [ReactNode, Ask] {
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
        current.resolve(a)
        setQueue((q) => q.filter((p) => p.id !== current.id))
      }}
    />
  ) : null
  return [element, ask]
}
