import { expect, test, type Request } from '@playwright/test'
import { deck, makePicture, open, saveAndReopen, toolbar } from './helpers'

// Spec, Phase 8: with the network off after the first load, every feature works and a full
// session makes zero network requests. Every window counts, the audience's included.

test('a full session with the network off: every feature works, zero network requests', async ({ page, context, browserName }) => {
  test.setTimeout(120_000)
  // First visit, online: the service worker installs and caches the app, fonts and licenses.
  await page.goto('/')
  await expect(page.getByText('Works offline')).toBeVisible({ timeout: 20_000 })
  const photo = await makePicture(page, 1600, 1200)

  await context.setOffline(true)
  const failed: string[] = []
  const network: string[] = []
  context.on('requestfailed', (r: Request) => failed.push(`${r.url()} (${r.failure()?.errorText})`))
  context.on('response', (r) => {
    // Chromium says which responses came from the service worker; in Firefox the offline network
    // itself is the check: anything that reached it fails.
    if (r.request().serviceWorker() === null && !r.fromServiceWorker() && !/^(data|blob):/.test(r.url())) network.push(r.url())
  })

  // Start the app with the network off.
  await open(page)
  await page.keyboard.type('Field trip')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // A new slide in another theme (its fonts come from the cache), with every kind of element.
  await page.keyboard.press('ControlOrMeta+m')
  await page.keyboard.press('Escape')
  await page.locator('.stage').focus()
  await toolbar(page).getByRole('button', { name: 'Theme' }).click()
  await page.getByRole('menu', { name: 'Theme' }).getByRole('menuitemradio', { name: 'Garden' }).click()
  const chooser = page.waitForEvent('filechooser')
  await toolbar(page).getByRole('button', { name: 'Picture' }).click()
  await (await chooser).setFiles({ name: 'trip.jpg', mimeType: 'image/jpeg', buffer: photo })
  await expect(page.locator('.stage img.el-image')).toBeVisible()
  await page.keyboard.press('Escape')
  await toolbar(page).getByRole('button', { name: 'Shape' }).click()
  await page.getByRole('menuitem', { name: 'Oval' }).click()
  await page.keyboard.press('Escape')
  await toolbar(page).getByRole('button', { name: 'Table' }).click()
  await page.getByRole('button', { name: 'Insert table' }).click()
  await page.keyboard.type('Stop')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await toolbar(page).getByRole('button', { name: 'Chart' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Insert chart' }).click()
  await page.keyboard.press('Escape')
  await toolbar(page).getByRole('button', { name: 'Transition' }).click()
  await page.getByRole('menuitemradio', { name: 'Fade in' }).click()
  await page.getByLabel('Speaker notes for slide 2').fill('Ask about the bus times.')
  expect((await deck(page)).slides[1].elements.map((e: { type: string }) => e.type).sort()).toEqual(
    ['chart', 'image', 'shape', 'table', 'text', 'text'].sort(),
  )

  // Sorter, save, reopen.
  await page.getByRole('button', { name: 'Slide sorter' }).click()
  await expect(page.getByRole('listbox', { name: 'All slides' })).toBeVisible()
  await page.keyboard.press('Escape')
  await saveAndReopen(page, 'Field trip')
  expect((await deck(page)).slides).toHaveLength(2)

  // Save as PDF: every page drawn, every picture decoded (the print window is the browser's).
  await page.evaluate(() => (window.print = () => {}))
  await page.locator('.stage').focus()
  await page.keyboard.press('ControlOrMeta+p')
  await page.getByRole('dialog', { name: 'Save as PDF' }).getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('.print-page')).toHaveCount(2)
  expect(await page.locator('.print-deck img').evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0))).toBe(true)

  // Present, start to finish.
  await page.locator('.stage').focus()
  await page.keyboard.press('F5')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.present-stage')).toHaveAttribute('data-shown', '1')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.present-end')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.present')).toHaveCount(0)

  // Presenter view: the audience's window starts offline too.
  await page.getByRole('button', { name: 'More ways to present' }).click()
  const popup = page.waitForEvent('popup')
  await page.getByRole('menuitem', { name: 'Presenter view (notes on this screen)' }).click()
  const audience = await popup
  await expect(audience.locator('.present-layer[data-index="0"]')).toContainText('Field trip')
  await audience.keyboard.press('ArrowRight')
  await expect(page.locator('.presenter-notes-text')).toHaveText('Ask about the bus times.')
  await page.keyboard.press('Escape')

  // About, and the licenses page, from the cache.
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'About MySlides' }).click()
  const licenses = page.waitForEvent('popup')
  await page.getByRole('dialog', { name: 'About MySlides' }).getByRole('button', { name: 'Third-party licenses' }).click()
  const licensePage = await licenses
  await expect(licensePage.locator('body')).toContainText('Third-party licenses: MySlides', { timeout: 10_000 })

  // Every bundled font, in every style, from the cache.
  const fonts = await page.evaluate(async () => {
    const out: Record<string, boolean> = {}
    for (const family of ['Tinos', 'Arimo', 'Carlito', 'Atkinson Hyperlegible', 'Lora']) {
      for (const style of ['', 'bold ', 'italic ', 'bold italic ']) {
        const faces = await document.fonts.load(`${style}24pt "${family}"`, 'Aé')
        out[`${style}${family}`] = faces.length > 0 && faces.every((f) => f.status === 'loaded')
      }
    }
    return out
  })
  expect(Object.values(fonts).every(Boolean), JSON.stringify(fonts)).toBe(true)

  expect(failed, 'requests that tried the network').toEqual([])
  if (browserName === 'chromium') expect(network, 'responses not from the service worker').toEqual([])
})
