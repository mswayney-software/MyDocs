import { CHART_TYPES, type Theme } from '../deck/schema'
import { THEMES } from '../deck/themes'
import { chartLayout, niceTicks, seriesColor, textCorners, type Box, type ChartData, type TextMark } from './chart-layout'

const theme: Theme = THEMES[0]
const chart = (patch: Partial<ChartData> = {}): ChartData => ({
  chartType: 'bar',
  title: 'Colony size',
  categories: ['Week 1', 'Week 2', 'Week 3'],
  series: [
    { name: 'Tank A', values: [3, 5, 9] },
    { name: 'Tank B', values: [2, 4, 7] },
  ],
  options: { legend: true, xTitle: 'Week', yTitle: 'Ants' },
  ...patch,
})

const twelveBySix = (): Partial<ChartData> => ({
  categories: Array.from({ length: 12 }, (_, i) => `Category number ${i + 1}`),
  series: Array.from({ length: 6 }, (_, s) => ({ name: `Series with a long name ${s + 1}`, values: Array.from({ length: 12 }, (_, i) => (i * 7 + s * 13) % 50 - 10) })),
})

/** The spec's hard cases (Phase 6, done when). */
const CASES: Record<string, Partial<ChartData>> = {
  'empty cells': { series: [{ name: 'A', values: [null, 4, null] }, { name: 'B', values: [1, null, 3] }] },
  'every cell empty': { series: [{ name: 'A', values: [null, null, null] }] },
  'negative numbers': { series: [{ name: 'A', values: [-5, 3, -12] }, { name: 'B', values: [-1, -2, -3] }] },
  'zero-only data': { series: [{ name: 'A', values: [0, 0, 0] }, { name: 'B', values: [0, 0, 0] }] },
  'a single data point': { categories: ['Only one'], series: [{ name: 'A', values: [42] }] },
  '12 categories by 6 series': twelveBySix(),
  'huge and tiny numbers': { series: [{ name: 'A', values: [1_250_000, 0.004, 980_000] }] },
  'no title, legend or axis titles': { title: '', options: { legend: false, xTitle: '', yTitle: '' } },
}

/** Do two labels, as drawn (slanted ones turned), overlap? Separating-axis test on their corners. */
function overlaps(a: TextMark, b: TextMark) {
  const pa = textCorners(a)
  const pb = textCorners(b)
  for (const poly of [pa, pb]) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[(i + 1) % 4]
      const nx = y2 - y1
      const ny = x1 - x2
      const proj = (p: [number, number][]) => p.map(([x, y]) => x * nx + y * ny)
      const [ia, ib] = [proj(pa), proj(pb)]
      const len = Math.hypot(nx, ny)
      if (Math.max(...ia) <= Math.min(...ib) + 0.5 * len || Math.max(...ib) <= Math.min(...ia) + 0.5 * len) return false
    }
  }
  return true
}
const inside = (b: Box, w: number, h: number) => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= w + 0.5 && b.y + b.h <= h + 0.5

describe('charts render the hard cases without overlap or errors', () => {
  for (const [name, patch] of Object.entries(CASES)) {
    for (const type of CHART_TYPES) {
      for (const [w, h] of [[560, 440], [320, 200]]) {
        it(`${name}: ${type} at ${w}×${h}`, () => {
          const { marks, plot } = chartLayout(chart({ ...patch, chartType: type }), theme, w, h)
          expect(JSON.stringify(marks)).not.toMatch(/NaN|Infinity|null/)
          const texts = marks.filter((m): m is TextMark => m.kind === 'text')
          for (const t of texts) expect(inside(t.box, w, h), `"${t.text}" inside the chart`).toBe(true)
          for (let i = 0; i < texts.length; i++)
            for (let j = i + 1; j < texts.length; j++)
              expect(overlaps(texts[i], texts[j]), `"${texts[i].text}" and "${texts[j].text}"`).toBe(false)
          if (plot) {
            expect(plot.w).toBeGreaterThan(0)
            expect(plot.h).toBeGreaterThan(0)
            for (const m of marks) {
              if (m.kind !== 'rect' || m.w === m.h) continue // legend swatches are square
              expect(m.y).toBeGreaterThanOrEqual(plot.y - 0.5)
              expect(m.y + m.h).toBeLessThanOrEqual(plot.y + plot.h + 0.5)
            }
          }
        })
      }
    }
  }

  it('draws one bar per number, and none for an empty cell', () => {
    const bars = (c: ChartData) => chartLayout(c, theme, 560, 440).marks.filter((m) => m.kind === 'rect' && m.w !== m.h)
    expect(bars(chart())).toHaveLength(6)
    expect(bars(chart(CASES['empty cells']))).toHaveLength(3)
  })

  it('negative bars hang below zero', () => {
    const { marks, plot } = chartLayout(chart({ series: [{ name: 'A', values: [-5, 5, 0] }], options: { legend: false, xTitle: '', yTitle: '' } }), theme, 560, 440)
    const [down, up] = marks.filter((m) => m.kind === 'rect') as { y: number; h: number }[]
    expect(down.y).toBeCloseTo(up.y + up.h, 5) // both meet at the zero line
    expect(down.y + down.h).toBeLessThanOrEqual(plot!.y + plot!.h + 0.5)
  })

  it('a line breaks at an empty cell instead of dropping to zero', () => {
    const { marks } = chartLayout(chart({ chartType: 'line', categories: ['a', 'b', 'c', 'd'], series: [{ name: 'A', values: [1, 2, null, 4] }] }), theme, 560, 440)
    const path = marks.find((m) => m.kind === 'path') as { d: string }
    expect(path.d.match(/M/g)).toHaveLength(2)
    expect(marks.filter((m) => m.kind === 'circle')).toHaveLength(3)
  })

  it('a pie uses the first series, one slice per positive number', () => {
    const { marks } = chartLayout(chart({ chartType: 'pie', series: [{ name: 'A', values: [1, 0, 3] }, { name: 'B', values: [9, 9, 9] }] }), theme, 560, 440)
    expect(marks.filter((m) => m.kind === 'path')).toHaveLength(2)
    expect(marks.filter((m) => m.kind === 'text').map((m) => (m as TextMark).text)).toEqual(expect.arrayContaining(['25%', '75%']))
  })
})

describe('labels are shortened only when they must be', () => {
  it('legend names that fit stay whole, at any size', () => {
    for (const [w, h] of [[1000, 480], [720, 440], [560, 440]]) {
      const c = chart({ series: ['Group A', 'Group B', 'Group C'].map((name) => ({ name, values: [1, 2, 3] })) })
      const texts = chartLayout(c, theme, w, h).marks.filter((m): m is TextMark => m.kind === 'text').map((t) => t.text)
      expect(texts, `${w}×${h}`).toEqual(expect.arrayContaining(['Group A', 'Group B', 'Group C']))
    }
  })
})

describe('chart colors come from the theme', () => {
  it('series take the accents in order, and the chart follows a theme switch', () => {
    const fills = (t: Theme) => chartLayout(chart({ options: { legend: false, xTitle: '', yTitle: '' } }), t, 560, 440).marks.filter((m) => m.kind === 'rect').map((m) => (m as { fill: string }).fill)
    expect(new Set(fills(THEMES[0]))).toEqual(new Set([THEMES[0].colors.accent1, THEMES[0].colors.accent2]))
    expect(new Set(fills(THEMES[3]))).toEqual(new Set([THEMES[3].colors.accent1, THEMES[3].colors.accent2]))
  })

  it('past six colors the accents come round lighter, so pie slices stay apart', () => {
    expect(seriesColor(theme, 6)).not.toBe(seriesColor(theme, 0))
  })
})

describe('axis steps', () => {
  it('are round numbers that cover the data and include zero', () => {
    expect(niceTicks(0, 9)).toEqual([0, 2, 4, 6, 8, 10])
    expect(niceTicks(-12, 5)).toEqual([-15, -10, -5, 0, 5])
    expect(niceTicks(0, 0)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    expect(niceTicks(0, 1_250_000).at(-1)).toBeGreaterThanOrEqual(1_250_000)
  })
})
