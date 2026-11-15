import { expect, firefox, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })
const json = (page: Page) => page.evaluate(() => window.__openWriter!.getJSON())
const status = (page: Page) => page.getByRole('status')
const recoverDialog = (page: Page) => page.getByRole('dialog', { name: 'Recover unsaved work?' })

/** Number of documents with a backup in IndexedDB, read straight from the database. */
const backupCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('open-writer')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const tx = req.result.transaction('backups', 'readonly')
          const keys = tx.objectStore('backups').getAllKeys()
          keys.onsuccess = () => resolve(keys.result.filter((k) => String(k).startsWith('snap:')).length)
        }
      }),
  )

async function open(page: Page) {
  await page.goto('/')
  await expect(doc(page)).toBeFocused()
}

/**
 * End the tab the hard way. Chromium: the OS kills the renderer process, as in a real crash
 * or Task Manager, so no page code (pagehide, beforeunload) gets to run. Firefox does not
 * expose its tab processes, so there the tab is closed without the leave prompt; the page's
 * pagehide handler still runs, which makes the Firefox run the weaker of the two.
 */
async function kill(page: Page, browserName: string) {
  if (browserName === 'chromium') {
    const cdp = await page.context().browser()!.newBrowserCDPSession()
    const { processInfo } = (await cdp.send('SystemInfo.getProcessInfo')) as {
      processInfo: { type: string; id: number }[]
    }
    for (const p of processInfo) if (p.type === 'renderer') process.kill(p.id)
    await cdp.detach()
  } else {
    await page.close({ runBeforeUnload: false })
  }
}

/** Make the browser behave like Firefox and Safari: no save or open dialogs, so download and file input. */
async function withoutFileSystemAccess(page: Page) {
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
}

async function openViaMenu(page: Page, file: { name: string; buffer: Buffer }) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Open…' }).click()
  await (await chooser).setFiles({ name: file.name, mimeType: 'application/json', buffer: file.buffer })
}

test.describe('crash recovery', () => {
  test('kill the tab mid-sentence, reopen, and the text is back', async ({ page, context, browserName }) => {
    await open(page)
    await page.getByLabel('Paragraph style').selectOption('h1')
    await page.keyboard.type('Chapter One')
    await page.keyboard.press('Enter')
    await page.keyboard.type('It was a dark and stormy')
    await page.waitForTimeout(2000) // the spec's limit: 2 seconds after the last keystroke
    const typed = await json(page)
    await kill(page, browserName)

    const again = await context.newPage()
    await again.goto('/')
    await expect(recoverDialog(again)).toBeVisible()
    await again.getByRole('button', { name: 'Restore' }).click()
    await expect(doc(again).locator('h1')).toHaveText('Chapter One')
    expect(await json(again)).toEqual(typed)
    await expect(status(again)).toHaveText('Unsaved changes')
  })

  test('continuous typing loses at most 2 seconds when the tab dies', async ({ page, context, browserName }) => {
    await open(page)
    const text = 'Sleep matters more than cramming. '.repeat(4) // ~4.5 s of steady typing
    const delay = 35
    await page.keyboard.type(text, { delay })
    await kill(page, browserName) // immediately after the last key

    const again = await context.newPage()
    await again.goto('/')
    await again.getByRole('button', { name: 'Restore' }).click()
    const recovered = (await doc(again).textContent()) ?? ''
    expect(text.startsWith(recovered)).toBe(true)
    // At 35 ms a key, 2 seconds is ~57 characters; anything older must be back.
    expect(text.length - recovered.length).toBeLessThanOrEqual(Math.ceil(2000 / delay))
  })

  test('Discard removes the backup for good, and is never chosen silently', async ({ page, context, browserName }) => {
    await open(page)
    await page.keyboard.type('Throwaway draft')
    await page.waitForTimeout(1500)
    await kill(page, browserName)

    const second = await context.newPage()
    await second.goto('/')
    await expect(recoverDialog(second)).toBeVisible()
    await second.keyboard.press('Escape') // dismissed: keep it for next time
    await second.close()

    const third = await context.newPage()
    await third.goto('/')
    await expect(recoverDialog(third)).toBeVisible()
    await expect.poll(() => backupCount(third)).toBe(1)
    await third.getByRole('button', { name: 'Discard' }).click()
    await expect.poll(() => backupCount(third)).toBe(0)
    await third.close()

    const fourth = await context.newPage()
    await fourth.goto('/')
    await expect(doc(fourth)).toBeFocused()
    await fourth.waitForTimeout(500)
    await expect(recoverDialog(fourth)).toHaveCount(0)
  })

  test('a second open tab does not take over the first tab’s backup', async ({ page, context }) => {
    await open(page)
    await page.keyboard.type('Still being edited in tab one')
    await page.waitForTimeout(1500)
    const second = await context.newPage()
    await second.goto('/')
    await expect(doc(second)).toBeFocused()
    await second.waitForTimeout(500)
    await expect(recoverDialog(second)).toHaveCount(0)
  })
})

test.describe('save and open', () => {
  test('Chrome: Ctrl+S saves, then writes back to the same file; the file reopens identical in Firefox', async ({ page, baseURL, browserName }) => {
    test.skip(browserName !== 'chromium', 'File System Access write-back is Chrome and Edge only')
    // Stand in for the native save dialog with a real file in the origin-private file system.
    await page.addInitScript(() => {
      const w = window as unknown as { pickerCalls: number; showSaveFilePicker: (o: { suggestedName: string }) => Promise<FileSystemFileHandle> }
      w.pickerCalls = 0
      w.showSaveFilePicker = async (o) => {
        w.pickerCalls++
        const root = await navigator.storage.getDirectory()
        return root.getFileHandle(o.suggestedName, { create: true })
      }
    })
    const readSaved = () =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        return (await (await root.getFileHandle('Untitled document.owdoc')).getFile()).text()
      })

    await open(page)
    await page.getByLabel('Paragraph style').selectOption('title')
    await page.keyboard.type('Cross-Browser Paper')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Bold claim: ')
    await page.keyboard.press('ControlOrMeta+b')
    await page.keyboard.type('sleep helps')
    await page.keyboard.press('ControlOrMeta+b')
    await expect(status(page)).toHaveText('Unsaved changes')

    await page.keyboard.press('ControlOrMeta+s')
    await expect(status(page)).toHaveText('Saved')
    expect(await page.evaluate(() => (window as unknown as { pickerCalls: number }).pickerCalls)).toBe(1)

    // Second save writes over the same file without asking again.
    await page.keyboard.type(' memory.')
    await expect(status(page)).toHaveText('Unsaved changes')
    await page.keyboard.press('ControlOrMeta+s')
    await expect(status(page)).toHaveText('Saved')
    expect(await page.evaluate(() => (window as unknown as { pickerCalls: number }).pickerCalls)).toBe(1)
    const saved = await readSaved()
    expect(saved).toContain('memory.')
    const chromeJson = await json(page)

    // Reopen the exact bytes in a real Firefox.
    const path = join(tmpdir(), `ow-e2e-${Date.now()}.owdoc`)
    writeFileSync(path, saved)
    const ff = await firefox.launch()
    try {
      const ffPage = await (await ff.newContext({ baseURL })).newPage()
      await open(ffPage)
      const chooser = ffPage.waitForEvent('filechooser')
      await ffPage.keyboard.press('Control+o')
      await (await chooser).setFiles(path)
      await expect(ffPage.locator('.file-name')).toHaveText(/^ow-e2e-/)
      expect(await json(ffPage)).toEqual(chromeJson)
      await expect(ffPage.getByRole('status')).toHaveText('Saved')
    } finally {
      await ff.close()
    }
  })

  test('without write-back (Firefox, Safari): saving downloads a copy and says so', async ({ page }) => {
    await withoutFileSystemAccess(page)
    await open(page)
    await page.keyboard.type('Downloaded essay text.')

    await page.keyboard.press('ControlOrMeta+s')
    const dialog = page.getByRole('dialog', { name: 'Save as' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('File name').fill('My Essay')
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download' }).click()
    expect((await download).suggestedFilename()).toBe('My Essay.owdoc')
    await expect(status(page)).toContainText('Downloaded a copy to your Downloads folder')
    await expect(page.locator('.file-name')).toHaveText('My Essay')

    // Ctrl+S again downloads straight away with the same name.
    await page.keyboard.type(' More.')
    const second = page.waitForEvent('download')
    await page.keyboard.press('ControlOrMeta+s')
    expect((await second).suggestedFilename()).toBe('My Essay.owdoc')
  })

  test('opening a file from a newer version explains instead of crashing', async ({ page }) => {
    await withoutFileSystemAccess(page)
    await open(page)
    await openViaMenu(page, {
      name: 'From the future.owdoc',
      buffer: Buffer.from(JSON.stringify({ format: 'open-writer', version: 99, doc: { type: 'doc' } })),
    })
    const err = page.getByRole('dialog', { name: 'Could not open "From the future.owdoc"' })
    await expect(err).toContainText('newer version of Open Writer')
    await err.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('.file-name')).toHaveText('Untitled document')
  })

  test('New with unsaved changes asks first, and undo cannot reach the old document', async ({ page }) => {
    await open(page)
    await page.keyboard.type('Old draft')
    await page.getByRole('button', { name: 'File', exact: true }).click()
    await page.getByRole('menuitem', { name: 'New', exact: true }).click()

    const ask = page.getByRole('dialog', { name: 'Save changes to "Untitled document"?' })
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(doc(page)).toHaveText('Old draft')

    await page.getByRole('button', { name: 'File', exact: true }).click()
    await page.getByRole('menuitem', { name: 'New', exact: true }).click()
    await ask.getByRole('button', { name: 'Don’t save' }).click()
    await expect(doc(page)).toHaveText('')
    await expect(status(page)).toHaveText('')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(doc(page)).toHaveText('')
  })

  test('a file action started while another is finishing does not act on the old document', async ({ page }) => {
    await withoutFileSystemAccess(page)
    await open(page)
    await page.keyboard.type('Draft to throw away')
    await page.getByRole('button', { name: 'File', exact: true }).click()
    await page.getByRole('menuitem', { name: 'New', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Don’t save' }).click()
    await page.keyboard.press('ControlOrMeta+o') // immediately, while New is still finishing
    await expect(doc(page)).toHaveText('')
    await page.waitForTimeout(500)
    await expect(page.getByRole('dialog', { name: /Save changes/ })).toHaveCount(0)
  })

  test('closing the tab with unsaved changes warns first', async ({ page }) => {
    await open(page)
    await page.keyboard.type('Unsaved words')
    const prompt = page.waitForEvent('dialog')
    void page.close({ runBeforeUnload: true })
    const dialog = await prompt
    expect(dialog.type()).toBe('beforeunload')
    await dialog.dismiss()
  })
})
