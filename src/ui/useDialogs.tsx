import { useCallback, useState, type ReactNode } from 'react'
import type { Ask, DialogAnswer, DialogSpec } from '../files/session'
import { DialogView } from './DialogView'

interface Pending {
  spec: DialogSpec
  resolve: (a: DialogAnswer) => void
}

/** Promise-based modal dialogs: `const answer = await ask({...})`. One at a time, queued. */
export function useDialogs(): [ReactNode, Ask] {
  const [queue, setQueue] = useState<Pending[]>([])
  const ask = useCallback<Ask>(
    (spec) => new Promise<DialogAnswer>((resolve) => setQueue((q) => [...q, { spec, resolve }])),
    [],
  )
  const current = queue[0]
  const element = current ? (
    <DialogView
      key={queue.length + current.spec.title}
      spec={current.spec}
      onAnswer={(a) => {
        current.resolve(a)
        setQueue((q) => q.slice(1))
      }}
    />
  ) : null
  return [element, ask]
}
