import { Plus, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ChartEdit } from '../canvas/controller'
import { CHART_TYPES, type Theme } from '../deck/schema'
import {
  addCategory, addSeries, badCells, canAddCategory, canAddSeries, fromDraft, removeCategory, removeSeries, toDraft, type ChartDraft,
} from '../elements/chart-cells'
import { ChartSvg } from '../elements/ChartView'

const TYPE_LABELS = { bar: 'Bar', line: 'Line', pie: 'Pie' } as const
const PREVIEW = { w: 560, h: 360 }

/**
 * The chart data window (spec, UI): first column the categories, first row the series names, the
 * rest numbers. A live preview sits beside it and the chart type switches at the top. It edits a
 * copy; Apply puts it in the deck as one undo step, Cancel leaves the deck alone.
 */
export function ChartDialog({ initial, isNew, theme, onApply, onCancel }: {
  initial: ChartEdit
  isNew: boolean
  theme: Theme
  onApply: (c: ChartEdit) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<ChartDraft>(() => toDraft(initial))
  const titleId = useId()
  const bad = badCells(draft)
  const chart = useMemo(() => fromDraft(draft), [draft])
  const pie = draft.chartType === 'pie'

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal()
    } else d.setAttribute('open', '')
    d.querySelector<HTMLInputElement>('.chart-grid input')?.focus()
    return () => d.close?.()
  }, [])

  const set = (patch: Partial<ChartDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const setCell = (ci: number, si: number, v: string) =>
    setDraft((d) => ({ ...d, cells: d.cells.map((row, r) => (r === ci ? row.map((x, c) => (c === si ? v : x)) : row)) }))

  /** Enter moves down a column, as in a spreadsheet. */
  const down = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const col = e.currentTarget.dataset.col
    const row = Number(e.currentTarget.dataset.row)
    ref.current?.querySelector<HTMLInputElement>(`.chart-grid input[data-col="${col}"][data-row="${row + (e.shiftKey ? -1 : 1)}"]`)?.focus()
  }

  const apply = () => {
    if (bad.size) return
    onApply(chart)
  }

  return (
    <dialog
      ref={ref}
      className="dlg chart-dlg"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
    >
      <form
        method="dialog"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          apply()
        }}
      >
        <div className="chart-dlg-head">
          <h2 id={titleId} className="dlg-title">
            {isNew ? 'New chart' : 'Chart data'}
          </h2>
          <div className="chart-types" role="radiogroup" aria-label="Chart type">
            {CHART_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={draft.chartType === t}
                className="chart-type"
                onClick={() => set({ chartType: t })}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-dlg-main">
          <div className="chart-dlg-data">
            {pie && draft.names.length > 1 && <p className="chart-note">A pie chart shows the first series only.</p>}
            <div className="chart-grid-scroll">
              <table className="chart-grid">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Categories</span>
                    </th>
                    {draft.names.map((name, si) => (
                      <th key={si} scope="col" className={pie && si > 0 ? 'is-unused' : undefined}>
                        <span className="chart-head">
                          <input
                            value={name}
                            aria-label={`Series ${si + 1} name`}
                            data-col={si}
                            data-row={-1}
                            onKeyDown={down}
                            onChange={(e) => set({ names: draft.names.map((n, k) => (k === si ? e.target.value : n)) })}
                          />
                          {draft.names.length > 1 && (
                            <button type="button" className="chart-x" aria-label={`Remove series ${si + 1}`} title="Remove this series" onClick={() => setDraft((d) => removeSeries(d, si))}>
                              <X size={14} aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </th>
                    ))}
                    <th>
                      <button type="button" className="chart-add" aria-label="Add a series" disabled={!canAddSeries(draft)} title={canAddSeries(draft) ? 'Add a series' : 'Six series at most'} onClick={() => setDraft(addSeries)}>
                        <Plus size={14} aria-hidden="true" /> Series
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draft.categories.map((cat, ci) => (
                    <tr key={ci}>
                      <th scope="row">
                        <span className="chart-head">
                          <input
                            value={cat}
                            aria-label={`Category ${ci + 1}`}
                            data-col="c"
                            data-row={ci}
                            onKeyDown={down}
                            onChange={(e) => set({ categories: draft.categories.map((c, k) => (k === ci ? e.target.value : c)) })}
                          />
                          {draft.categories.length > 1 && (
                            <button type="button" className="chart-x" aria-label={`Remove category ${ci + 1}`} title="Remove this category" onClick={() => setDraft((d) => removeCategory(d, ci))}>
                              <X size={14} aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </th>
                      {draft.names.map((name, si) => {
                        const wrong = bad.has(`${ci},${si}`)
                        const errId = `${titleId}-e${ci}-${si}`
                        return (
                          <td key={si} className={pie && si > 0 ? 'is-unused' : undefined}>
                            <input
                              className="chart-num"
                              inputMode="decimal"
                              value={draft.cells[ci][si]}
                              aria-label={`${name || `Series ${si + 1}`}, ${cat || `category ${ci + 1}`}`}
                              aria-invalid={wrong || undefined}
                              aria-describedby={wrong ? errId : undefined}
                              data-col={si}
                              data-row={ci}
                              onKeyDown={down}
                              onChange={(e) => setCell(ci, si, e.target.value)}
                            />
                            {wrong && (
                              <span id={errId} className="chart-bad">
                                Not a number
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="chart-add" aria-label="Add a category" disabled={!canAddCategory(draft)} title={canAddCategory(draft) ? 'Add a category' : 'Twelve categories at most'} onClick={() => setDraft(addCategory)}>
              <Plus size={14} aria-hidden="true" /> Category
            </button>
            <p className="chart-hint">Leave a cell empty for a gap.</p>
          </div>

          <div className="chart-dlg-side">
            <div className="chart-preview" style={{ background: theme.colors.background }} aria-hidden="true">
              <ChartSvg chart={chart} theme={theme} width={PREVIEW.w} height={PREVIEW.h} />
            </div>
            <div className="chart-options">
              <label className="dlg-field">
                Title
                <input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
              </label>
              <label className="dlg-check">
                <input type="checkbox" checked={draft.legend} onChange={(e) => set({ legend: e.target.checked })} /> Legend
              </label>
              {!pie && (
                <div className="chart-axes">
                  <label className="dlg-field">
                    Horizontal axis title
                    <input value={draft.xTitle} onChange={(e) => set({ xTitle: e.target.value })} />
                  </label>
                  <label className="dlg-field">
                    Vertical axis title
                    <input value={draft.yTitle} onChange={(e) => set({ yTitle: e.target.value })} />
                  </label>
                </div>
              )}
              <label className="dlg-field">
                Alt text (read out by screen readers)
                <input value={draft.alt} placeholder="What the chart shows, in a sentence" onChange={(e) => set({ alt: e.target.value })} />
              </label>
            </div>
          </div>
        </div>

        <div className="dlg-buttons chart-dlg-foot">
          {bad.size > 0 && (
            <p className="chart-bad-note" role="status">
              {bad.size === 1 ? 'One cell isn’t a number.' : `${bad.size} cells aren’t numbers.`} Fix {bad.size === 1 ? 'it' : 'them'} or leave {bad.size === 1 ? 'it' : 'them'} empty to apply.
            </p>
          )}
          <button type="button" className="dlg-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="dlg-btn dlg-primary" disabled={bad.size > 0}>
            {isNew ? 'Insert chart' : 'Apply'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
