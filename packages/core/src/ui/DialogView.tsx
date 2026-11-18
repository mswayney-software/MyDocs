import { useEffect, useId, useRef, useState } from 'react'
import type { DialogAnswer, DialogField, DialogSpec } from './dialogTypes'

export function DialogView({ spec, onAnswer }: { spec: DialogSpec; onAnswer: (a: DialogAnswer) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((spec.fields ?? []).map((f) => [f.key, f.value])),
  )
  const titleId = useId()
  const bodyId = useId()
  const answered = useRef(false)

  const answer = (value: string) => {
    if (answered.current) return
    answered.current = true
    ref.current?.close?.()
    onAnswer({ value, values })
  }

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal()
    } else d.setAttribute('open', '') // jsdom and very old browsers
    const field = d.querySelector<HTMLInputElement | HTMLSelectElement>('input:not([type="checkbox"]), select')
    if (field) {
      field.focus()
      if (field instanceof HTMLInputElement) field.select()
    } else d.querySelector<HTMLButtonElement>('.dlg-primary')?.focus()
  }, [])

  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))
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
      {/* noValidate: the code that asked clamps every value; a button that silently refuses helps no one. */}
      <form
        method="dialog"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          answer(primary)
        }}
      >
        <h2 id={titleId} className="dlg-title">{spec.title}</h2>
        {spec.body && <p id={bodyId} className="dlg-body">{spec.body}</p>}
        {spec.fields && (
          <div className="dlg-fields">
            {spec.fields.map((f) => (
              <Field key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
            ))}
          </div>
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

function Field({ field: f, value, onChange }: { field: DialogField; value: string; onChange: (v: string) => void }) {
  const id = useId()
  if (f.type === 'checkbox') {
    return (
      <label className="dlg-check">
        <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(String(e.target.checked))} />
        <span>{f.label}</span>
      </label>
    )
  }
  if (f.type === 'select') {
    // Labeled by id, not by wrapping: a wrapped select's name would include every option.
    return (
      <div className={f.half ? 'dlg-field dlg-half' : 'dlg-field'}>
        <label htmlFor={id}>{f.label}</label>
        <select id={id} className="dlg-select" value={value} onChange={(e) => onChange(e.target.value)}>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }
  return (
    <label className={f.half ? 'dlg-field dlg-half' : 'dlg-field'}>
      <span>{f.label}</span>
      <span className="dlg-input-row">
        <input
          type={f.type ?? 'text'}
          value={value}
          min={f.min}
          max={f.max}
          step={f.step}
          maxLength={f.maxLength}
          placeholder={f.placeholder}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
        {f.suffix && <span className="dlg-suffix">{f.suffix}</span>}
      </span>
    </label>
  )
}
