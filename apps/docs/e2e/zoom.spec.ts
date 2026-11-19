import { expect, test, type Page } from '@playwright/test'
import { pdfText } from './pdf-text'

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })
const sheetWidth = (page: Page) => page.locator('.sheet').evaluate((el) => el.getBoundingClientRect().width)

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
})

test('zoom enlarges the page, clicks still land on the right word, and the zoom is remembered', async ({ page }) => {
  await page.keyboard.type('alpha beta gamma')
  const at100 = await sheetWidth(page)
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByRole('button', { name: /^Zoom 130%/ })).toBeVisible()
  expect(await sheetWidth(page)).toBeCloseTo(at100 * 1.3, 0)
  // Zoom buttons leave the cursor in the document.
  await expect(doc(page)).toBeFocused()

  // Click just after "beta" and type: the text goes there.
  const beta = await page.evaluate(() => {
    const p = document.querySelector('.doc p')!
    const text = p.firstChild!
    const r = document.createRange()
    const at = text.textContent!.indexOf('beta')
    r.setStart(text, at + 2)
    r.setEnd(text, at + 3)
    const box = r.getBoundingClientRect()
    return { x: box.right, y: box.top + box.height / 2 }
  })
  await page.mouse.click(beta.x - 1, beta.y)
  await page.keyboard.type('X')
  await expect(doc(page)).toHaveText('alpha betXa gamma')

  await page.reload()
  // The typing is offered back after a reload, as it should be; not needed here.
  await page.getByRole('dialog', { name: 'Recover unsaved work?' }).getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByRole('button', { name: /^Zoom 130%/ })).toBeVisible()
  await page.getByRole('button', { name: /^Zoom 130%/ }).click() // back to 100%
  await expect(page.getByRole('button', { name: /^Zoom 100%/ })).toBeVisible()
  expect(await sheetWidth(page)).toBeCloseTo(at100, 0)
})

test('printing ignores the zoom', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium can print to PDF under test')
  await page.keyboard.type('Left margin check')
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
  const [first] = await pdfText(await page.pdf({ preferCSSPageSize: true }))
  const item = first.items.find((t) => t.str.includes('Left margin'))!
  expect(item.x).toBeCloseTo(72, 0) // one inch, as at 100%
  expect(item.h).toBeCloseTo(12, 0) // 12 pt text, not 18
})
