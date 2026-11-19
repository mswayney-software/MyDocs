import { expect, test, type Page } from '@playwright/test'
import { pdfText } from './pdf-text'

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })
const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme)
const sheetFilter = (page: Page) => page.locator('.sheet').evaluate((el) => getComputedStyle(el).filter)

async function pick(page: Page, role: 'menuitemradio' | 'menuitemcheckbox', name: string) {
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole(role, { name, exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
})

test('dark mode darkens the app and the page, and is remembered', async ({ page }) => {
  expect(await theme(page)).toBe('light')
  expect(await sheetFilter(page)).toBe('none')
  await pick(page, 'menuitemradio', 'Dark')
  expect(await theme(page)).toBe('dark')
  expect(await sheetFilter(page)).toContain('invert(1)')
  // The cursor is back in the document, ready to type.
  await expect(doc(page)).toBeFocused()
  await page.keyboard.type('In the dark')
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Dark', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('menuitemradio', { name: 'Light', exact: true })).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Escape')

  await page.reload()
  expect(await theme(page)).toBe('dark')
  await page.getByRole('dialog', { name: 'Recover unsaved work?' }).getByRole('button', { name: 'Discard' }).click()
  await pick(page, 'menuitemradio', 'Light')
  expect(await theme(page)).toBe('light')
})

test('"Match my device" follows the device setting as it changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await pick(page, 'menuitemradio', 'Match my device')
  expect(await theme(page)).toBe('light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => theme(page)).toBe('dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => theme(page)).toBe('light')
})

test('the typewriter light shines up from just below the word being typed and scrolls with the text', async ({ page }) => {
  await pick(page, 'menuitemcheckbox', 'Typewriter light')
  const light = page.locator('.typewriter-light')
  await expect(light).toBeVisible()
  await expect(doc(page)).toBeFocused()

  /** Where the LED is, against the word that ends at the cursor (`word` is its text). */
  const ledUnder = async (word: string) => {
    await page.waitForTimeout(300) // the light glides over in 120 ms
    return page.evaluate((length) => {
      const ed = window.__openWriter!
      const head = ed.state.selection.head
      const caret = ed.view.coordsAtPos(head)
      const start = ed.view.coordsAtPos(head - length)
      const led = document.querySelector('.lamp-led')!.getBoundingClientRect()
      const lineHeight = caret.bottom - caret.top
      return {
        offCenter: Math.abs((led.left + led.right) / 2 - (start.left + caret.left) / 2),
        gapBelowLine: led.top - caret.bottom,
        lineHeight,
      }
    }, word.length)
  }
  const expectUnder = async (word: string) => {
    const at = await ledUnder(word)
    expect(at.offCenter).toBeLessThan(2)
    expect(at.gapBelowLine).toBeGreaterThanOrEqual(0)
    expect(at.gapBelowLine).toBeLessThan(at.lineHeight * 0.6)
  }

  await page.keyboard.type('First line')
  await expectUnder('line')
  // It moves along as the word grows and on to the next word.
  await page.keyboard.type('s of a longer sentence')
  await expectUnder('sentence')

  for (let i = 0; i < 40; i++) await page.keyboard.press('Enter')
  await page.keyboard.type('Far down the page')
  await expectUnder('page')

  // Scrolling moves the light with the text, with nothing to recompute.
  await page.locator('.workspace').evaluate((el) => el.scrollBy(0, -200))
  await expectUnder('page')

  // Zooming keeps it under the word.
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expectUnder('page')

  // Clicks pass through the light to the text under it.
  await page.locator('.doc p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  expect(await page.locator('.doc p').first().textContent()).toBe('First lines of a longer sentence!')

  // Off again, and remembered.
  await pick(page, 'menuitemcheckbox', 'Typewriter light')
  await expect(light).toHaveCount(0)
  await pick(page, 'menuitemcheckbox', 'Typewriter light')
  await page.reload()
  await page.getByRole('dialog', { name: 'Recover unsaved work?' }).getByRole('button', { name: 'Discard' }).click()
  await expect(light).toBeVisible()
})

test('the printed page is black on white, without the light, in dark mode', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium can print to PDF under test')
  await pick(page, 'menuitemradio', 'Dark')
  await pick(page, 'menuitemcheckbox', 'Typewriter light')
  await page.keyboard.type('Printed in the dark')
  await page.emulateMedia({ media: 'print' })
  expect(await sheetFilter(page)).toBe('none')
  await expect(page.locator('.typewriter-light')).toBeHidden()
  const colors = await page.evaluate(() => ({
    ink: getComputedStyle(document.querySelector('.doc')!).color,
    paper: getComputedStyle(document.querySelector('.sheet')!).backgroundColor,
  }))
  expect(colors).toEqual({ ink: 'rgb(0, 0, 0)', paper: 'rgb(255, 255, 255)' })
  await page.emulateMedia({ media: null }) // back to normal, so the PDF prints as print
  const [first] = await pdfText(await page.pdf({ preferCSSPageSize: true }))
  expect(first.items.map((t) => t.str).join('')).toContain('Printed in the dark')
})
