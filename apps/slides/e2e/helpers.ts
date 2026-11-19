import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const deck = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__mySlides!.getState().deck)))
export const current = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__mySlides!.currentSlide())))
export const selection = (page: Page) => page.evaluate(() => [...window.__mySlidesCanvas!.getState().selected])
export const live = (page: Page) => page.locator('.el-live .ProseMirror')
export const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Slide tools' })

/** A new deck, with no write-back, so saving downloads (the same in every browser). */
export async function open(page: Page) {
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await page.goto('/')
  await expect(live(page)).toBeFocused()
}

/** Automated accessibility scan (axe-core, WCAG 2.1 A and AA). */
export async function scan(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), what).toEqual([])
}

/** Save as a download, start a new deck, and open the saved file again. */
export async function saveAndReopen(page: Page, name: string) {
  await page.keyboard.press('ControlOrMeta+s')
  const dialog = page.getByRole('dialog', { name: 'Save as' })
  await dialog.getByLabel('File name').fill(name)
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download' }).click()
  const path = join(mkdtempSync(join(tmpdir(), 'myslides-')), `${name}.myslides`)
  copyFileSync((await (await download).path())!, path)
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New', exact: true }).click()
  await expect(page.locator('.file-name')).toHaveText('Untitled deck')
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+o')
  await (await chooser).setFiles(path)
  await expect(page.locator('.file-name')).toHaveText(name)
}

/** Screen point for a slide-unit point on the canvas. */
export async function screen(page: Page, x: number, y: number) {
  const r = (await page.locator('.slide-layer').boundingBox())!
  const scale = r.width / 1280
  return { x: r.x + x * scale, y: r.y + y * scale, scale }
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.mouse.up()
}

/**
 * A picture made in the browser: a photo-like JPEG (gradients and noise, so it compresses like
 * a real photo) or a PNG with transparency.
 */
export async function makePicture(page: Page, width: number, height: number, type: 'image/jpeg' | 'image/png' = 'image/jpeg') {
  const bytes = await page.evaluate(
    async ({ width, height, type }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      const g = ctx.createLinearGradient(0, 0, width, height)
      g.addColorStop(0, '#2d6a4f')
      g.addColorStop(0.5, '#f4a261')
      g.addColorStop(1, '#264653')
      ctx.fillStyle = g
      if (type === 'image/png') ctx.fillRect(width / 4, height / 4, width / 2, height / 2)
      else ctx.fillRect(0, 0, width, height)
      if (type === 'image/jpeg') {
        // Noise, block by block, so the file is photo-sized.
        const block = ctx.createImageData(256, 256)
        for (let i = 0; i < block.data.length; i += 4) {
          const n = Math.random() * 60
          block.data[i] = n
          block.data[i + 1] = n
          block.data[i + 2] = n
          block.data[i + 3] = 40
        }
        const tile = document.createElement('canvas')
        tile.width = tile.height = 256
        tile.getContext('2d')!.putImageData(block, 0, 0)
        for (let y = 0; y < height; y += 256) for (let x = 0; x < width; x += 256) ctx.drawImage(tile, x, y)
      }
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), type, 0.92))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    { width, height, type },
  )
  return Buffer.from(bytes)
}
