import { SAMPLE_CHART } from '../canvas/controller'
import { LIMITS } from '../deck/schema'
import { addCategory, addSeries, badCells, fromDraft, readCell, removeCategory, removeSeries, toDraft } from './chart-cells'

describe('reading what is typed in a chart cell', () => {
  it('reads numbers the way people type them', () => {
    expect(['12', '-3.5', '+7', '1,250', '12%', '−4', ' 0 ', '.5', '1e3'].map((s) => readCell(s).value)).toEqual([12, -3.5, 7, 1250, 12, -4, 0, 0.5, 1000])
  })
  it('an empty cell is a gap, not zero', () => {
    expect(readCell('  ')).toEqual({ value: null, ok: true })
  })
  it('flags anything that is not a number', () => {
    for (const s of ['abc', '12abc', '1.2.3', '--4', 'NaN', 'Infinity', '$5']) expect(readCell(s).ok, s).toBe(false)
  })
})

describe('the chart data window draft', () => {
  it('round-trips a chart unchanged', () => {
    expect(fromDraft(toDraft(SAMPLE_CHART))).toEqual(SAMPLE_CHART)
  })
  it('keeps empty cells empty', () => {
    const chart = { ...SAMPLE_CHART, series: [{ name: 'A', values: [null, 2, null] }] }
    expect(fromDraft(toDraft(chart)).series[0].values).toEqual([null, 2, null])
  })
  it('names the cells that are not numbers', () => {
    const d = toDraft(SAMPLE_CHART)
    d.cells[1][0] = 'lots'
    expect([...badCells(d)]).toEqual(['1,0'])
  })
  it('adds and removes categories and series within the limits, never below one', () => {
    let d = toDraft(SAMPLE_CHART)
    for (let i = 0; i < 20; i++) d = addSeries(addCategory(d))
    expect([d.categories.length, d.names.length]).toEqual([LIMITS.chartCategories, LIMITS.chartSeries])
    expect(d.cells.every((row) => row.length === LIMITS.chartSeries)).toBe(true)
    for (let i = 0; i < 20; i++) d = removeSeries(removeCategory(d, 0), 0)
    expect([d.categories.length, d.names.length, d.cells]).toEqual([1, 1, [['']]])
  })
})
