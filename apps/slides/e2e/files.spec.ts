import { expect, firefox, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A 2x2 PNG, so a picture travels through backups and files. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBkYGBgYAA8ABAH/0+XVAAAAAElFTkSuQmCC'

const status = (page: Page) => page.locator('.file-state')
const recoverDialog = (page: Page) => page.getByRole('dialog', { name: 'Recover unsaved work?' })
/** The deck as plain data (compared as values: the order of fields in an object is not meaningful). */
const deckJson = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__mySlides!.getState().deck)))
const isDirty = (page: Page) => page.evaluate(() => window.__mySlides!.getState().dirty)

/** How many backups the browser holds (IndexedDB "myslides", store "backups"). */
const backupCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('myslides')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const keys = req.result.transaction('backups').objectStore('backups').getAllKeys()
          keys.onsuccess = () => resolve(keys.result.filter((k) => String(k).startsWith('snap:')).length)
        }
      }),
  )

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Untitled deck' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!window.__mySlides)).toBe(true)
}

/**
 * Change the deck the way Phase 2's editor will: add a slide with a title, a picture, and a
 * chart, and write speaker notes. Returns once the change is in the deck.
 */
async function editDeck(page: Page, title = 'Cell Division') {
  await page.evaluate(
    async ({ png, title }) => {
      const n = window.__mySlides!.getState().deck.slides.length
      const s = window.__mySlides!
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
      const src = await s.addPicture(new Blob([bytes], { type: 'image/png' }))
      s.update((deck) => ({
        ...deck,
        slides: [
          ...deck.slides,
          {
            id: `slide-added-${n}`, layout: 'title-content', background: null, transition: 'fade', notes: 'Say hello.',
            elements: [
              { id: `title-added-${n}`, type: 'text', role: 'title', x: 80, y: 48, w: 1120, h: 96, verticalAlign: 'middle',
                content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }] } },
              { id: `pic-added-${n}`, type: 'image', x: 680, y: 400, w: 320, h: 216, src, alt: 'A cell' },
              { id: `chart-added-${n}`, type: 'chart', x: 80, y: 176, w: 560, h: 440, chartType: 'bar', title: 'Growth', alt: 'Growth chart',
                categories: ['W1', 'W2'], series: [{ name: 'A', values: [1, null] }], options: { legend: true, xTitle: '', yTitle: '' } },
            ],
          },
        ],
      }))
    },
    { png: PNG_BASE64, title },
  )
}

/**
 * End the tab the hard way. Chromium: the OS kills the renderer process, as in a real crash,
 * so no page code runs. Firefox does not expose its tab processes, so there the tab is closed
 * without the leave prompt; its pagehide handler still runs, the weaker of the two.
 */
async function kill(page: Page, browserName: string) {
  if (browserName === 'chromium') {
    const cdp = await page.context().browser()!.newBrowserCDPSession()
    const { processInfo } = (await cdp.send('SystemInfo.getProcessInfo')) as { processInfo: { type: string; id: number }[] }
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

async function openFileViaMenu(page: Page, file: { name: string; buffer: Buffer }) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Open…' }).click()
  await (await chooser).setFiles({ name: file.name, mimeType: 'application/zip', buffer: file.buffer })
}

/** Save through the download path and return the file's bytes. */
async function downloadDeck(page: Page, name: string): Promise<Buffer> {
  await page.keyboard.press('ControlOrMeta+s')
  const dialog = page.getByRole('dialog', { name: 'Save as' })
  await dialog.getByLabel('File name').fill(name)
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download' }).click()
  const d = await download
  expect(d.suggestedFilename()).toBe(`${name}.myslides`)
  return readFileSync((await d.path())!)
}

/** Unzip with Python's standard zipfile module: a tool that is not this app's ZIP library. */
function unzipWithStandardTool(zipPath: string, dir: string) {
  for (const python of ['python3', 'python']) {
    try {
      execFileSync(python, ['-I', '-m', 'zipfile', '-e', zipPath, dir], { stdio: 'pipe' })
      return
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err
    }
  }
  throw new Error('Python is needed to check the deck unzips with a standard tool')
}

test.describe('crash recovery', () => {
  test('kill the tab after a change, reopen, and the deck and its pictures are back', async ({ page, context, browserName }) => {
    await open(page)
    await editDeck(page)
    await expect(status(page)).toHaveText('Unsaved changes')
    await page.waitForTimeout(2000) // the spec's limit: 2 seconds after the last change
    const before = await deckJson(page)
    await kill(page, browserName)

    const again = await context.newPage()
    await again.goto('/')
    await expect(recoverDialog(again)).toBeVisible()
    await again.getByRole('button', { name: 'Restore' }).click()
    await expect(status(again)).toHaveText('Unsaved changes')
    expect(await deckJson(again)).toEqual(before)
    // The picture came back from the backup store, byte for byte.
    const png = await again.evaluate(async () => {
      const [blob] = window.__mySlides!.getMedia().values()
      return blob ? btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer()))) : null
    })
    expect(png).toBe(PNG_BASE64)
    await expect(again.getByRole('navigation', { name: 'Slides' }).getByRole('option')).toHaveCount(2)
  })

  test('kill the tab in the middle of typing in a box: what was typed comes back', async ({ page, context, browserName }) => {
    await open(page)
    // Still typing: the box has not been left, so nothing is committed to the deck yet.
    await page.keyboard.type('Half a sentence about the water cycle')
    await page.waitForTimeout(2000)
    await kill(page, browserName)

    const again = await context.newPage()
    await again.goto('/')
    await expect(recoverDialog(again)).toBeVisible()
    await again.getByRole('button', { name: 'Restore' }).click()
    await expect(again.locator('.stage .el-text').first()).toContainText('Half a sentence about the water cycle')
  })

  test('Escape keeps a backup for later; Discard removes it for good', async ({ page, context, browserName }) => {
    await open(page)
    await editDeck(page, 'Throwaway')
    await page.waitForTimeout(1500)
    await kill(page, browserName)

    const second = await context.newPage()
    await second.goto('/')
    await expect(recoverDialog(second)).toBeVisible()
    await second.keyboard.press('Escape')
    await second.close()

    const third = await context.newPage()
    await third.goto('/')
    await expect(recoverDialog(third)).toBeVisible()
    await expect.poll(() => backupCount(third)).toBe(1)
    await third.getByRole('button', { name: 'Discard' }).click()
    // Closing the tab before the delete lands would only bring the question back next time.
    await expect.poll(() => backupCount(third)).toBe(0)
    await third.close()

    const fourth = await context.newPage()
    await open(fourth)
    await fourth.waitForTimeout(500)
    await expect(recoverDialog(fourth)).toHaveCount(0)
  })
})

test.describe('save and open', () => {
  test('without write-back (Firefox, Safari): saving downloads a deck that unzips with a standard tool', async ({ page }) => {
    await withoutFileSystemAccess(page)
    await open(page)
    await editDeck(page)
    const bytes = await downloadDeck(page, 'Cell Division')
    await expect(status(page)).toContainText('Downloaded a copy to your Downloads folder')
    await expect(page.locator('.file-name')).toHaveText('Cell Division')

    const dir = mkdtempSync(join(tmpdir(), 'myslides-unzip-'))
    const zipPath = join(dir, 'deck.zip')
    writeFileSync(zipPath, bytes)
    unzipWithStandardTool(zipPath, join(dir, 'out'))
    const text = readFileSync(join(dir, 'out', 'deck.json'), 'utf8')
    expect(text).toContain('\n  "format": "myslides",\n') // indented for people to read
    const deck = JSON.parse(text)
    expect(deck.slides[1].elements[0].content.content[0].content[0].text).toBe('Cell Division')
    expect(deck.slides[1].elements[2].series[0].values).toEqual([1, null])
    const src: string = deck.slides[1].elements[1].src
    expect(readFileSync(join(dir, 'out', src)).toString('base64')).toBe(PNG_BASE64)
    expect(readFileSync(join(dir, 'out', 'README.txt'), 'utf8')).toContain('MySlides')
  })

  test('Chrome: Ctrl+S writes back to the same file; the file reopens identical in Firefox', async ({ page, baseURL, browserName }) => {
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
    const readSaved = async () =>
      Buffer.from(
        await page.evaluate(async () => {
          const root = await navigator.storage.getDirectory()
          const file = await (await root.getFileHandle('Untitled deck.myslides')).getFile()
          return btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())))
        }),
        'base64',
      )

    await open(page)
    await editDeck(page)
    await page.keyboard.press('ControlOrMeta+s')
    await expect(status(page)).toHaveText('Saved')
    expect(await page.evaluate(() => (window as unknown as { pickerCalls: number }).pickerCalls)).toBe(1)

    // A second save writes over the same file without asking again.
    await editDeck(page, 'Second title')
    await expect(status(page)).toHaveText('Unsaved changes')
    await page.keyboard.press('ControlOrMeta+s')
    await expect(status(page)).toHaveText('Saved')
    expect(await page.evaluate(() => (window as unknown as { pickerCalls: number }).pickerCalls)).toBe(1)
    const chromeDeck = await deckJson(page)

    // Reopen the exact bytes in a real Firefox.
    const path = join(mkdtempSync(join(tmpdir(), 'myslides-')), 'Chrome deck.myslides')
    writeFileSync(path, await readSaved())
    const ff = await firefox.launch()
    try {
      const ffPage = await (await ff.newContext({ baseURL })).newPage()
      await open(ffPage)
      const chooser = ffPage.waitForEvent('filechooser')
      await ffPage.keyboard.press('Control+o')
      await (await chooser).setFiles(path)
      await expect(ffPage.locator('.file-name')).toHaveText('Chrome deck')
      await expect(ffPage.locator('.file-state')).toHaveText('Saved')
      expect(await deckJson(ffPage)).toEqual(chromeDeck)
    } finally {
      await ff.close()
    }
  })

  test('a saved deck reopens identical, with its picture', async ({ page }) => {
    await withoutFileSystemAccess(page)
    await open(page)
    await editDeck(page)
    const bytes = await downloadDeck(page, 'Round trip')
    const saved = await deckJson(page)

    await page.getByRole('button', { name: 'File', exact: true }).click()
    await page.getByRole('menuitem', { name: 'New', exact: true }).click()
    await expect(page.locator('.file-name')).toHaveText('Untitled deck')
    await openFileViaMenu(page, { name: 'Round trip.myslides', buffer: bytes })
    await expect(page.locator('.file-name')).toHaveText('Round trip')
    expect(await deckJson(page)).toEqual(saved)
    expect(await page.evaluate(() => window.__mySlides!.getMedia().size)).toBe(1)
  })
})

test.describe('files that cannot be opened', () => {
  test('a deck from a newer version, and a damaged file, each explain instead of crashing', async ({ page }) => {
    await withoutFileSystemAccess(page)
    await open(page)
    const good = await downloadDeck(page, 'Good')

    // Newer version: the same file with formatVersion 99 inside.
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(good)
    const json = JSON.parse(await zip.file('deck.json')!.async('string'))
    json.formatVersion = 99
    zip.file('deck.json', JSON.stringify(json))
    await openFileViaMenu(page, { name: 'From the future.myslides', buffer: await zip.generateAsync({ type: 'nodebuffer' }) })
    let err = page.getByRole('dialog', { name: 'Could not open "From the future.myslides"' })
    await expect(err).toContainText('This deck was made with a newer version of MySlides. Update the app to open it.')
    await err.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('.file-name')).toHaveText('Good')

    await openFileViaMenu(page, { name: 'Half.myslides', buffer: good.subarray(0, Math.floor(good.length / 2)) })
    err = page.getByRole('dialog', { name: 'Could not open "Half.myslides"' })
    await expect(err).toContainText("This file isn't a MySlides deck, or it is damaged.")
    await err.getByRole('button', { name: 'OK' }).click()
    await expect(page.locator('.file-name')).toHaveText('Good')
    // The app still works.
    await editDeck(page)
    expect(await isDirty(page)).toBe(true)
  })

  test('a deck with one broken element opens, says so, and keeps the rest', async ({ page }) => {
    await withoutFileSystemAccess(page)
    await open(page)
    await editDeck(page)
    const bytes = await downloadDeck(page, 'Mostly fine')
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(bytes)
    const json = JSON.parse(await zip.file('deck.json')!.async('string'))
    json.slides[1].elements[2].chartType = 'radar'
    zip.file('deck.json', JSON.stringify(json))
    await openFileViaMenu(page, { name: 'Mostly fine.myslides', buffer: await zip.generateAsync({ type: 'nodebuffer' }) })
    const note = page.getByRole('dialog', { name: '"Mostly fine.myslides" opened with problems' })
    await expect(note).toContainText('One part of this deck could not be read.')
    await note.getByRole('button', { name: 'OK' }).click()
    const types = await page.evaluate(() => window.__mySlides!.getState().deck.slides[1].elements.map((e) => e.type))
    expect(types).toEqual(['text', 'image', 'broken'])
  })
})

test('New with unsaved changes asks first, and Cancel keeps the deck', async ({ page }) => {
  await open(page)
  await editDeck(page)
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New', exact: true }).click()
  const ask = page.getByRole('dialog', { name: 'Save changes to "Untitled deck"?' })
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('navigation', { name: 'Slides' }).getByRole('option')).toHaveCount(2)

  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Don’t save' }).click()
  await expect(page.getByRole('navigation', { name: 'Slides' }).getByRole('option')).toHaveCount(1)
  await expect(status(page)).toHaveText('')
})
