import { useEffect, useId, useRef, useState } from 'react'
import type { DialogAnswer, DialogSpec } from '../files/session'

export function DialogView({ spec, onAnswer }: { spec: DialogSpec; onAnswer: (a: DialogAnswer) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [input, setInput] = useState(spec.input?.value ?? '')
  const titleId = useId()
  const bodyId = useId()
  const answered = useRef(false)

  const answer = (value: string) => {
    if (answered.current) return
    answered.current = true
    ref.current?.close?.()
    onAnswer({ value, input })
  }

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal()
    } else d.setAttribute('open', '') // jsdom and very old browsers
    const field = d.querySelector<HTMLInputElement>('input')
    if (field) {
      field.focus()
      field.select()
    } else d.querySelector<HTMLButtonElement>('.dlg-primary')?.focus()
  }, [])

  const primary = spec.buttons.find((b) => b.primary)?.value ?? spec.buttons[0].value
  return (
    <dialog
      ref={ref}
      className="dlg"
      aria-labelledby={titleId}
      aria-describedby={spec.body ? bodyId : undefined}
      onCancel={(e) => {
        e.preventDefault()
        answer(spec.cancelValue)
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          answer(primary)
        }}
      >
        <h2 id={titleId} className="dlg-title">{spec.title}</h2>
        {spec.body && <p id={bodyId} className="dlg-body">{spec.body}</p>}
        {spec.input && (
          <label className="dlg-field">
            <span>{spec.input.label}</span>
            <span className="dlg-input-row">
              <input value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} />
              {spec.input.suffix && <span className="dlg-suffix">{spec.input.suffix}</span>}
            </span>
          </label>
        )}
        <div className="dlg-buttons">
          {spec.buttons.map((b) => (
            <button
              key={b.value}
              type={b.primary ? 'submit' : 'button'}
              className={b.primary ? 'dlg-btn dlg-primary' : 'dlg-btn'}
              onClick={b.primary ? undefined : () => answer(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </form>
    </dialog>
  )
}
