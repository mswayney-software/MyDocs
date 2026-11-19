import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import { current, deck, open, saveAndReopen, scan, toolbar } from './helpers'

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
type Cell = { content: { content?: { content?: { text?: string }[] }[] }; fill: string | null; align: string }
type Table = { type: 'table'; id: string; w: number; h: number; headerRow: boolean; columnWidths: number[]; rows: { cells: Cell[] }[] }
type Chart = { type: 'chart'; id: string; chartType: string; categories: string[]; series: { name: string; values: (number | null)[] }[] }

const cellText = (c: Cell) => (c.content.content ?? []).flatMap((p) => p.content ?? []).map((t) => t.text ?? '').join('')
const grid = (t: Table) => t.rows.map((r) => r.cells.map(cellText))
const tableOf = async (page: Page) => (await current(page)).elements.find((e: { type: string }) => e.type === 'table') as Table
const chartOf = async (page: Page) => (await current(page)).elements.find((e: { type: string }) => e.type === 'chart') as Chart

/** A blank slide to work on, with the keyboard on the canvas. */
async function blankSlide(page: Page) {
  await open(page)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.__mySlides!.update((d) => void (d.slides[0].elements = [])))
  await page.locator('.stage').focus()
}

async function insertTable(page: Page, rows: number, cols: number) {
  await toolbar(page).getByRole('button', { name: 'Table' }).click()
  await page.getByRole('spinbutton', { name: 'Rows' }).fill(String(rows))
  await page.getByRole('spinbutton', { name: 'Columns' }).fill(String(cols))
  await page.getByRole('button', { name: 'Insert table' }).click()
}

/** Run a "Rows and columns" menu item while the table is being edited. */
async function tableMenu(page: Page, item: string) {
  await toolbar(page).getByRole('button', { name: 'Rows and columns' }).click()
  await page.getByRole('menu', { name: 'Rows and columns' }).getByRole(item === 'Header row' ? 'menuitemcheckbox' : 'menuitem', { name: item }).click()
}

test.describe('tables', () => {
  test('type, add and remove rows and columns, style the header, and survive save and reopen', async ({ page }) => {
    await blankSlide(page)
    await insertTable(page, 2, 2)
    for (const t of ['Planet', 'Moons', 'Earth']) {
      await page.keyboard.type(t)
      await page.keyboard.press('Tab')
    }
    await page.keyboard.type('1')
    // Tab past the last cell adds a row.
    await page.keyboard.press('Tab')
    await page.keyboard.type('Mars')
    await page.keyboard.press('Tab')
    await page.keyboard.type('2')
    // New rows and columns appear beside the caret, which stays where it was.
    await tableMenu(page, 'Insert column right')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Rings')
    await tableMenu(page, 'Insert row above')
    await page.locator('.el-live tr').nth(2).locator('td').nth(2).click()
    await page.keyboard.type('Venus')
    await page.keyboard.press('Escape')
    expect(grid(await tableOf(page))).toEqual([
      ['Planet', 'Moons', ''],
      ['Earth', '1', ''],
      ['', '', 'Venus'],
      ['Mars', '2', 'Rings'],
    ])

    // Removing: the Venus row, then the third column.
    await page.locator('.stage .el-table td', { hasText: 'Venus' }).click()
    await page.locator('.stage .el-table td', { hasText: 'Venus' }).click()
    await tableMenu(page, 'Delete row')
    await page.locator('.el-live th').nth(2).click()
    await tableMenu(page, 'Delete column')
    await page.keyboard.press('Escape')
    let t = await tableOf(page)
    expect(grid(t)).toEqual([['Planet', 'Moons'], ['Earth', '1'], ['Mars', '2']])
    expect(t.columnWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(t.w, 1)

    // The header row takes the theme's first accent.
    const theme = (await deck(page)).theme
    await expect(page.locator('.stage .el-table th').first()).toHaveCSS('background-color', rgb(theme.colors.accent1))

    // Cell formatting: fill and alignment.
    await page.locator('.stage .el-table td', { hasText: 'Mars' }).click()
    await page.locator('.stage .el-table td', { hasText: 'Mars' }).click()
    await toolbar(page).getByRole('button', { name: /^Cell fill/ }).click()
    await page.getByRole('button', { name: 'Accent 2' }).click()
    await toolbar(page).getByRole('button', { name: 'Center' }).click()
    await expect(toolbar(page).getByRole('button', { name: 'Center' })).toHaveAttribute('aria-pressed', 'true')
    await tableMenu(page, 'Header row')
    await page.keyboard.press('Escape')
    t = await tableOf(page)
    expect(t.headerRow).toBe(false)
    expect(t.rows[2].cells[0]).toMatchObject({ fill: 'accent2', align: 'center' })
    await expect(page.locator('.stage .el-table th')).toHaveCount(0)

    // Leaving the table made one undo step.
    await page.keyboard.press('ControlOrMeta+z')
    expect((await tableOf(page)).headerRow).toBe(true)
    await page.keyboard.press('ControlOrMeta+y')

    const before = await tableOf(page)
    await saveAndReopen(page, 'Planets')
    const after = await tableOf(page)
    expect(after.rows).toEqual(before.rows)
    expect([after.headerRow, after.columnWidths]).toEqual([before.headerRow, before.columnWidths])
    // Stored without the editor's empty settings.
    expect(JSON.stringify(after.rows)).not.toContain('"attrs"')
  })

  test('limits: 20 rows and 10 columns; never fewer than one', async ({ page }) => {
    await blankSlide(page)
    await insertTable(page, 20, 10)
    await page.keyboard.press('Escape')
    let t = await tableOf(page)
    expect([t.rows.length, t.rows[0].cells.length]).toEqual([20, 10])
    // Tab at the last cell no longer adds a row; the menu can't add either.
    await page.keyboard.press('Enter')
    await page.evaluate(() => window.__mySlidesCanvas!.getState().editor!.commands.focus('end'))
    await page.keyboard.press('Tab')
    await toolbar(page).getByRole('button', { name: 'Rows and columns' }).click()
    const menu = page.getByRole('menu', { name: 'Rows and columns' })
    await expect(menu.getByRole('menuitem', { name: 'Insert row below' })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: 'Insert column right' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    t = await tableOf(page)
    expect([t.rows.length, t.rows[0].cells.length]).toEqual([20, 10])

    await page.evaluate(() => window.__mySlides!.update((d) => void (d.slides[0].elements = [])))
    await page.locator('.stage').focus()
    await insertTable(page, 1, 1)
    await page.keyboard.type('Total')
    await toolbar(page).getByRole('button', { name: 'Rows and columns' }).click()
    await expect(menu.getByRole('menuitem', { name: 'Delete row' })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: 'Delete column' })).toBeDisabled()
    await scan(page, 'editing a table')
  })

  test('drag a column edge; the table keeps its width; one undo puts it back', async ({ page }) => {
    await blankSlide(page)
    await insertTable(page, 3, 3)
    await page.keyboard.press('Escape')
    const before = await tableOf(page)
    const edge = page.locator('.col-edge').first()
    const b = (await edge.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 5 })
    await page.mouse.up()
    const after = await tableOf(page)
    expect(after.columnWidths[0]).toBeGreaterThan(before.columnWidths[0] + 40)
    expect(after.columnWidths[1]).toBeLessThan(before.columnWidths[1] - 40)
    expect(after.columnWidths[2]).toBe(before.columnWidths[2])
    expect(after.columnWidths.reduce((a, c) => a + c, 0)).toBeCloseTo(after.w, 1)
    await page.keyboard.press('ControlOrMeta+z')
    expect((await tableOf(page)).columnWidths).toEqual(before.columnWidths)
  })
})

/** Open the chart data window for the selected chart (Enter), or for a new chart. */
const dialog = (page: Page) => page.getByRole('dialog')
const cell = (page: Page, series: string, category: string) => dialog(page).getByRole('textbox', { name: `${series}, ${category}`, exact: true })

test.describe('charts', () => {
  test('each chart type renders from the data grid, reopens with the same numbers, and redraws on Apply', async ({ page }) => {
    await blankSlide(page)
    await toolbar(page).getByRole('button', { name: 'Chart' }).click()
    await expect(dialog(page)).toHaveAccessibleName('New chart')
    await scan(page, 'the chart data window')
    await dialog(page).getByRole('textbox', { name: 'Category 1' }).fill('Mon')
    await cell(page, 'Series 1', 'Mon').fill('12')
    await cell(page, 'Series 2', 'Mon').fill('lots')
    // A cell that isn't a number is flagged in plain words, and Apply waits.
    await expect(dialog(page).getByText('Not a number')).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Insert chart' })).toBeDisabled()
    await cell(page, 'Series 2', 'Mon').fill('')
    await dialog(page).getByRole('button', { name: 'Insert chart' }).click()
    await expect(dialog(page)).toHaveCount(0)

    const svg = page.locator('.stage .el-chart svg')
    // Bar: one bar per number (the empty cell has none), plus two legend swatches.
    let c = await chartOf(page)
    expect(c.series.map((s) => s.values)).toEqual([[12, 7, 5], [null, 5, 8]])
    await expect(svg.locator('rect')).toHaveCount(5 + 2)

    for (const type of ['Line', 'Pie', 'Bar'] as const) {
      await page.keyboard.press('Enter')
      await expect(dialog(page)).toHaveAccessibleName('Chart data')
      // The same numbers come back.
      await expect(cell(page, 'Series 1', 'Mon')).toHaveValue(type === 'Line' ? '12' : '20')
      await expect(cell(page, 'Series 2', 'Mon')).toHaveValue('')
      await dialog(page).getByRole('radio', { name: type }).click()
      await cell(page, 'Series 1', 'Mon').fill('20')
      await dialog(page).getByRole('button', { name: 'Apply' }).click()
      c = await chartOf(page)
      expect(c.chartType).toBe(type.toLowerCase())
      expect(c.series[0].values[0]).toBe(20)
      if (type === 'Line') {
        await expect(svg.locator('path')).toHaveCount(2)
        await expect(svg.locator('circle')).toHaveCount(5)
      } else if (type === 'Pie') {
        // The first series: 20, 7 and 5, as three slices with their shares.
        await expect(svg.locator('path')).toHaveCount(3)
        await expect(svg.locator('text', { hasText: '63%' })).toHaveCount(1)
      } else await expect(svg.locator('rect')).toHaveCount(5 + 2)
    }

    // Cancel leaves the chart alone; Apply is one undo step.
    await page.keyboard.press('Enter')
    await cell(page, 'Series 1', 'Mon').fill('99')
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    expect((await chartOf(page)).series[0].values[0]).toBe(20)
    await page.keyboard.press('ControlOrMeta+z')
    expect((await chartOf(page)).chartType).toBe('pie')

    await saveAndReopen(page, 'Readings')
    expect((await chartOf(page)).series).toEqual(c.series)
  })

  test('the hard cases render without errors: gaps, negatives, all zero, one point, 12 by 6', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    // Firefox reports the validation library's check for eval, which the app's security policy
    // blocks on purpose; it is not an error in drawing.
    page.on('console', (m) => m.type() === 'error' && !/blocked a JavaScript eval/.test(m.text()) && errors.push(m.text()))
    await blankSlide(page)
    await toolbar(page).getByRole('button', { name: 'Chart' }).click()
    await dialog(page).getByRole('button', { name: 'Insert chart' }).click()
    const cases: Record<string, { categories: string[]; series: { name: string; values: (number | null)[] }[] }> = {
      gaps: { categories: ['a', 'b', 'c'], series: [{ name: 'A', values: [null, 4, null] }] },
      negatives: { categories: ['a', 'b', 'c'], series: [{ name: 'A', values: [-5, 3, -12] }] },
      zeros: { categories: ['a', 'b', 'c'], series: [{ name: 'A', values: [0, 0, 0] }] },
      one: { categories: ['only'], series: [{ name: 'A', values: [42] }] },
      big: {
        categories: Array.from({ length: 12 }, (_, i) => `Category number ${i + 1}`),
        series: Array.from({ length: 6 }, (_, s) => ({ name: `Series ${s + 1}`, values: Array.from({ length: 12 }, (_, i) => ((i * 7 + s * 13) % 50) - 10) })),
      },
    }
    const box = (await page.locator('.stage .el-chart').boundingBox())!
    for (const [name, data] of Object.entries(cases)) {
      for (const chartType of ['bar', 'line', 'pie']) {
        await page.evaluate(
          ({ data, chartType }) =>
            window.__mySlides!.update((d) => {
              const el = d.slides[0].elements.find((e) => e.type === 'chart')
              if (el?.type === 'chart') Object.assign(el, data, { chartType })
            }),
          { data, chartType },
        )
        // Every label is drawn inside the chart.
        const outside = await page.locator('.stage .el-chart svg text').evaluateAll(
          (texts, b) => texts.filter((t) => {
            const r = t.getBoundingClientRect()
            return r.left < b.x - 2 || r.top < b.y - 2 || r.right > b.x + b.width + 2 || r.bottom > b.y + b.height + 2
          }).map((t) => t.textContent),
          box,
        )
        expect(outside, `${name}, ${chartType}`).toEqual([])
      }
    }
    expect(errors).toEqual([])
  })
})

test('switching theme recolors every chart and table header, with no other step', async ({ page }) => {
  await blankSlide(page)
  await insertTable(page, 2, 2)
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+m')
  await page.locator('.stage').focus()
  await toolbar(page).getByRole('button', { name: 'Chart' }).click()
  await dialog(page).getByRole('button', { name: 'Insert chart' }).click()
  await page.keyboard.press('Escape')

  await toolbar(page).getByRole('button', { name: 'Theme' }).click()
  await page.getByRole('menu', { name: 'Theme' }).getByRole('menuitemradio', { name: 'Garden' }).click()
  const garden = (await deck(page)).theme
  // The chart on this slide, in the canvas and its thumbnail.
  await expect(page.locator('.stage .el-chart rect').first()).toHaveAttribute('fill', garden.colors.accent1)
  await expect(page.locator('.strip-thumb').nth(1).locator('.el-chart rect').first()).toHaveAttribute('fill', garden.colors.accent1)
  // The table's header on the other slide: the first accent (shaded a touch for contrast in Garden).
  const head = page.locator('.strip-thumb').first().locator('.el-table th').first()
  const color = await head.evaluate((th) => getComputedStyle(th).backgroundColor)
  expect(color).not.toBe(rgb((await import('../src/deck/themes')).THEMES[0].colors.accent1))
  const expected = await page.evaluate(() => getComputedStyle(document.querySelector('.strip-thumb .el-table')!).getPropertyValue('--table-head-bg').trim())
  expect(color).toBe(rgb(expected))
  expect(expected.toLowerCase()).not.toBe('#1f7a8c')
})

test('deck.json holds table cells and chart numbers as plain data, read without the app', async ({ page }) => {
  await blankSlide(page)
  await insertTable(page, 2, 2)
  for (const t of ['Name', 'Score', 'Ana']) {
    await page.keyboard.type(t)
    await page.keyboard.press('Tab')
  }
  await page.keyboard.type('91')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await toolbar(page).getByRole('button', { name: 'Chart' }).click()
  await cell(page, 'Series 1', 'Group 1').fill('-2.5')
  await cell(page, 'Series 2', 'Group 3').fill('')
  await dialog(page).getByRole('button', { name: 'Insert chart' }).click()

  // Save as a download and read it with a plain ZIP reader and JSON.parse: no app code.
  await page.keyboard.press('ControlOrMeta+s')
  const save = page.getByRole('dialog', { name: 'Save as' })
  const download = page.waitForEvent('download')
  await save.getByRole('button', { name: 'Download' }).click()
  const zip = await JSZip.loadAsync(readFileSync((await (await download).path())!))
  const json = JSON.parse(await zip.file('deck.json')!.async('string'))
  const [table, chart] = ['table', 'chart'].map((type) => json.slides[0].elements.find((e: { type: string }) => e.type === type))

  expect(table.rows.map((r: { cells: Cell[] }) => r.cells.map(cellText))).toEqual([['Name', 'Score'], ['Ana', '91']])
  expect(table.rows[0].cells[0]).toEqual({ content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] }, fill: null, align: 'left' })
  expect(chart.categories).toEqual(['Group 1', 'Group 2', 'Group 3'])
  expect(chart.series).toEqual([
    { name: 'Series 1', values: [-2.5, 7, 5] },
    { name: 'Series 2', values: [3, 5, null] },
  ])
  // Numbers are numbers in the file, not text.
  expect(await zip.file('deck.json')!.async('string')).toContain('"values": [\n')
})
