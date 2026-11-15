import { expect, test, type Page, type Request } from '@playwright/test'

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })

/** Every request the page makes, and whether the service worker answered it. */
function recordRequests(page: Page) {
  const failed: string[] = []
  const network: string[] = []
  page.on('requestfailed', (r: Request) => failed.push(`${r.url()} (${r.failure()?.errorText})`))
  page.on('response', (r) => {
    // Chromium reports which responses came from the service worker; Firefox always says false,
    // so there the offline network itself is the check: anything that reached it fails.
    if (r.request().serviceWorker() === null && !r.fromServiceWorker() && !r.url().startsWith('data:')) {
      network.push(r.url())
    }
  })
  return { failed, network }
}

test('after the first load, the app starts and every feature works with the network off', async ({ page, context, browserName }) => {
  // First visit, online: the service worker installs and caches everything.
  await page.goto('/')
  await expect(page.getByText('Works offline')).toBeVisible({ timeout: 20_000 })

  await context.setOffline(true)
  const requests = recordRequests(page)
  // Chrome's real save and open dialogs cannot be automated: from this load on, both browsers
  // take the download and file-input path (the app decides which path at startup).
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await page.reload()
  await expect(doc(page)).toBeFocused()
  await expect(page.getByText('Works offline')).toBeVisible()

  // Every bundled font style is available from the cache.
  const fonts = await page.evaluate(async () => {
    const out: Record<string, boolean> = {}
    for (const family of ['Tinos', 'Arimo', 'Carlito']) {
      for (const style of ['', 'bold ', 'italic ', 'bold italic ']) {
        const faces = await document.fonts.load(`${style}12pt "${family}"`, 'Aé€ω')
        out[`${style}${family}`] = faces.length > 0 && faces.every((f) => f.status === 'loaded')
      }
    }
    return out
  })
  expect(Object.values(fonts).every(Boolean), JSON.stringify(fonts)).toBe(true)

  // Write and format a paper with every M1 feature.
  await page.getByLabel('Paragraph style').selectOption('title')
  await page.keyboard.type('Offline Paper')
  await page.keyboard.press('Enter')
  await page.getByLabel('Paragraph style').selectOption('h1')
  await page.keyboard.type('Heading')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Plain ')
  for (const [shortcut, word] of [['b', 'bold'], ['i', 'italic'], ['u', 'underline']] as const) {
    await page.keyboard.press(`ControlOrMeta+${shortcut}`)
    await page.keyboard.type(word)
    await page.keyboard.press(`ControlOrMeta+${shortcut}`)
    await page.keyboard.type(' ')
  }
  await page.getByRole('button', { name: 'Superscript' }).click()
  await page.keyboard.type('2')
  await page.getByRole('button', { name: 'Superscript' }).click()
  await page.getByLabel('Font', { exact: true }).selectOption('Arimo')
  await page.keyboard.type(' sans')
  await page.getByLabel('Font', { exact: true }).selectOption('Carlito')
  await page.getByLabel('Font size').selectOption('18')
  await page.keyboard.type(' big')
  await page.getByRole('button', { name: 'Text color' }).click()
  await page.getByRole('button', { name: 'Red', exact: true }).click()
  await page.keyboard.type(' red')
  await page.getByRole('button', { name: 'Highlight', exact: true }).click()
  await page.getByRole('button', { name: 'Yellow', exact: true }).click()
  await page.keyboard.type(' marked')
  await page.getByRole('button', { name: 'Justify' }).click()
  await page.getByLabel('Line spacing').selectOption('2')
  await page.getByRole('button', { name: 'Format', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Space after paragraph' }).click()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Numbered list' }).click()
  await page.keyboard.type('One')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Nested')
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('ControlOrMeta+y')

  const d = doc(page)
  await expect(d.locator('p[data-type="title"]')).toHaveText('Offline Paper')
  await expect(d.locator('strong')).toHaveText('bold')
  await expect(d.locator('ol ol li')).toHaveText('Nested')
  await expect(d.locator('mark')).toContainText('marked')
  // The bundled fonts are what actually renders, not a system fallback.
  expect(await page.evaluate(() => document.fonts.check('12pt Arimo') && document.fonts.check('bold 12pt Tinos'))).toBe(true)

  // Save, start a new document, recover a backup, and open the saved file, all offline.
  const before = await page.evaluate(() => window.__openWriter!.getJSON())
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save as…' }).click()
  const saveAs = page.getByRole('dialog', { name: 'Save as' })
  await saveAs.getByLabel('File name').fill('Offline Paper')
  await saveAs.getByRole('button', { name: 'Download' }).click()
  const path = await (await download).path()
  expect(path).toBeTruthy()

  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New' }).click()
  await expect(d).toHaveText('')

  // Recovery works offline too: reload with unsaved text, restore it.
  await page.keyboard.type('Backed up offline')
  await page.waitForTimeout(1500)
  await page.reload()
  await page.getByRole('button', { name: 'Restore' }).click()
  await expect(d).toHaveText('Backed up offline')

  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Don’t save' }).click()
  await expect(d).toHaveText('')
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('ControlOrMeta+o')
  await (await chooser).setFiles(path)
  expect(await page.evaluate(() => window.__openWriter!.getJSON())).toEqual(before)

  expect(requests.failed, 'requests that tried the network').toEqual([])
  if (browserName === 'chromium') expect(requests.network, 'responses not from the service worker').toEqual([])
})
