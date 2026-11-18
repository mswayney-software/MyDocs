import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { current, deck, drag, makePicture, open, saveAndReopen, scan, screen, selection, toolbar } from './helpers'

/** The pixel size of a stored picture, read back from the deck's media. */
const storedSize = (page: Page, src: string) =>
  page.evaluate(async (src) => {
    const bitmap = await createImageBitmap(window.__mySlides!.getMedia().get(src)!)
    return { width: bitmap.width, height: bitmap.height, type: window.__mySlides!.getMedia().get(src)!.type }
  }, src)

/** Hand a picture to the page as if dropped at a screen point. */
async function sendPicture(page: Page, how: 'drop', bytes: Buffer, at: { x: number; y: number }) {
  await page.evaluate(
    ({ how, data, at }) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(data)], 'pasted.png', { type: 'image/png' }))
      const stage = document.querySelector('.stage')!
      const init = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }
      if (how === 'drop') {
        stage.dispatchEvent(new DragEvent('dragover', init))
        stage.dispatchEvent(new DragEvent('drop', init))
      }
    },
    { how, data: [...bytes], at },
  )
}

test('a 12-megapixel photo inserts in under 2 seconds, stored at 1920 px or less; alt text; locked proportions; paste and drop', async ({ page, browserName }) => {
  await open(page)
  await page.keyboard.press('Escape')
  const photo = await makePicture(page, 4000, 3000)
  expect(photo.length).toBeGreaterThan(1_000_000) // photo-sized, not a tiny test file

  // Timed in the page, from the file being chosen to the picture on the slide: what a student
  // waits for. (Timing from the test would add the test tool's own file transfer.)
  await page.evaluate(() => {
    const w = window as unknown as { chosenAt?: number; placedAt?: number }
    document.addEventListener('change', () => (w.chosenAt = performance.now()), { capture: true, once: true })
    const seen = new MutationObserver(() => {
      if (document.querySelector('.stage .el-image')) {
        w.placedAt = performance.now()
        seen.disconnect()
      }
    })
    seen.observe(document.body, { childList: true, subtree: true })
  })
  const chooser = page.waitForEvent('filechooser')
  await toolbar(page).getByRole('button', { name: 'Picture' }).click()
  // From a file on disk, as a student's photo arrives.
  const photoPath = join(mkdtempSync(join(tmpdir(), 'myslides-')), 'leaf.jpg')
  writeFileSync(photoPath, photo)
  await (await chooser).setFiles(photoPath)
  await expect(page.locator('.stage .el-image')).toHaveCount(1)
  const took = await page.evaluate(() => {
    const w = window as unknown as { chosenAt: number; placedAt: number }
    return Math.round(w.placedAt - w.chosenAt)
  })
  console.log(`12 MP photo inserted in ${took} ms`)
  expect(took).toBeLessThan(2000)

  const pic = (await current(page)).elements.find((e: { type: string }) => e.type === 'image')
  const stored = await storedSize(page, pic.src)
  expect(Math.max(stored.width, stored.height)).toBe(1920)
  expect(stored).toMatchObject({ height: 1440, type: 'image/jpeg' })
  // Fitted inside the slide, in proportion, and selected.
  expect(pic.w / pic.h).toBeCloseTo(4 / 3, 2)
  expect(pic.x).toBeGreaterThanOrEqual(0)
  expect(pic.y + pic.h).toBeLessThanOrEqual(720)
  expect(await selection(page)).toEqual([pic.id])
  await expect(page.locator('.stage .el-image')).toHaveJSProperty('complete', true)

  await scan(page, 'a selected picture and its tools')
  await toolbar(page).getByRole('button', { name: 'Alt text' }).click()
  const dialog = page.getByRole('dialog', { name: 'Alt text' })
  await dialog.getByLabel('Description').fill('A green leaf in sunlight')
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('.stage .el-image')).toHaveAttribute('alt', 'A green leaf in sunlight')

  // Corner and side handles keep the proportions.
  const corner = page.locator('.handle-se')
  const box = (await corner.boundingBox())!
  await drag(page, { x: box.x + 5, y: box.y + 5 }, { x: box.x - 120, y: box.y + 5 })
  const resized = (await current(page)).elements.find((e: { id: string }) => e.id === pic.id)
  expect(resized.w).toBeLessThan(pic.w)
  expect(resized.w / resized.h).toBeCloseTo(4 / 3, 1)

  // Paste a picture, and drop one on the slide.
  const png = await makePicture(page, 400, 300, 'image/png')
  await page.locator('.stage').focus()
  if (browserName === 'chromium') {
    // A real paste: the picture on the system clipboard, then Ctrl+V on the canvas.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.evaluate(async (data) => {
      const blob = new Blob([new Uint8Array(data)], { type: 'image/png' })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    }, [...png])
    await page.keyboard.press('ControlOrMeta+v')
  } else {
    // Firefox empties script-made clipboard events and gives automation no clipboard; a drop
    // goes through the same picture path.
    await sendPicture(page, 'drop', png, await screen(page, 640, 360))
  }
  await expect(page.locator('.stage .el-image')).toHaveCount(2)
  const pasted = (await current(page)).elements.at(-1)
  expect((await storedSize(page, pasted.src)).type).toBe('image/png') // transparency kept
  const target = await screen(page, 300, 200)
  await sendPicture(page, 'drop', png, target)
  await expect(page.locator('.stage .el-image')).toHaveCount(3)
  const dropped = (await current(page)).elements.at(-1)
  expect(dropped.x + dropped.w / 2).toBeCloseTo(300, -1)
  expect(dropped.y + dropped.h / 2).toBeCloseTo(200, -1)
  // The same picture twice is stored once.
  expect(dropped.src).toBe(pasted.src)

  // A GIF comes in as a still picture: its first frame, as PNG.
  const gif = page.waitForEvent('filechooser')
  await toolbar(page).getByRole('button', { name: 'Picture' }).click()
  await (await gif).setFiles({
    name: 'wave.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'),
  })
  await expect(page.locator('.stage .el-image')).toHaveCount(4)
  const still = (await current(page)).elements.at(-1)
  expect(still.src).toMatch(/\.png$/)
  expect((await storedSize(page, still.src)).type).toBe('image/png')
  await page.keyboard.press('Delete')
  await expect(page.locator('.stage .el-image')).toHaveCount(3)

  // Not a picture: a plain message, nothing added.
  const bad = page.waitForEvent('filechooser')
  await toolbar(page).getByRole('button', { name: 'Picture' }).click()
  await (await bad).setFiles({ name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not really a picture') })
  await expect(page.getByRole('dialog', { name: 'That file can’t be used as a picture' })).toBeVisible()
  await page.getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('.stage .el-image')).toHaveCount(3)

  const before = await current(page)
  await saveAndReopen(page, 'Pictures')
  const after = await current(page)
  expect(after.elements).toEqual(before.elements)
  expect(await storedSize(page, pic.src)).toMatchObject({ width: 1920, height: 1440 })
  await expect(page.locator('.stage .el-image').first()).toHaveAttribute('alt', 'A green leaf in sunlight')
})

test('the six shapes: insert, color from the theme, outline, lines in any direction; save and reopen', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Escape')
  const names = ['Rectangle', 'Rounded rectangle', 'Oval', 'Triangle', 'Line', 'Arrow']
  for (const name of names) {
    await toolbar(page).getByRole('button', { name: 'Shape' }).click()
    if (name === 'Rectangle') await scan(page, 'the shape menu')
    await page.getByRole('menu', { name: 'Shape' }).getByRole('menuitem', { name, exact: true }).click()
  }
  let shapes = (await current(page)).elements.filter((e: { type: string }) => e.type === 'shape')
  expect(shapes.map((s: { shape: string }) => s.shape)).toEqual(['rect', 'round-rect', 'ellipse', 'triangle', 'line', 'arrow'])
  await expect(page.locator('.stage svg.el-shape')).toHaveCount(6)

  // Style the oval: fill and outline follow the theme.
  // Where only the oval is: off the triangle, away from the lines across the middle.
  await page.locator(`.stage [data-id="${shapes[2].id}"]`).click({ position: { x: 30, y: 60 } })
  expect(await selection(page)).toEqual([shapes[2].id])
  await toolbar(page).getByRole('button', { name: 'Fill' }).click()
  await scan(page, 'the fill color picker')
  await page.getByRole('dialog', { name: 'Fill' }).getByRole('button', { name: 'Accent 2' }).click()
  await toolbar(page).getByRole('button', { name: 'Outline' }).click()
  await page.getByRole('dialog', { name: 'Outline' }).getByRole('button', { name: 'Black' }).click()
  await toolbar(page).getByLabel('Outline width').selectOption('6')
  const oval = (await current(page)).elements.find((e: { id: string }) => e.id === shapes[2].id)
  expect(oval).toMatchObject({ fill: 'accent2', stroke: '#000000', strokeWidth: 6 })
  await expect(page.locator(`.stage [data-id="${oval.id}"] g`)).toHaveAttribute('fill', '#E07A5F')

  // Lines: drag the end handle up and to the left, past the start: the line points the other way.
  const arrow = shapes[5]
  await page.locator(`.stage [data-id="${arrow.id}"]`).click({ position: { x: 20, y: 10 } })
  expect(await selection(page)).toEqual([arrow.id])
  await expect(page.locator('.handle-end')).toHaveCount(2)
  await expect(page.locator('.handle-se')).toHaveCount(0)
  const end = (await page.locator('.handle-end[data-end="to"]').boundingBox())!
  const target = await screen(page, arrow.x - 100, arrow.y - 150)
  await drag(page, { x: end.x + end.width / 2, y: end.y + end.height / 2 }, target)
  const moved = (await current(page)).elements.find((e: { id: string }) => e.id === arrow.id)
  expect(moved).toMatchObject({ flipH: true, flipV: true })
  expect(moved.x).toBeCloseTo(arrow.x - 100, -1)
  expect(moved.w).toBeCloseTo(100, -1)
  expect(moved.h).toBeCloseTo(150, -1)
  // One undo step puts it back.
  await page.keyboard.press('ControlOrMeta+z')
  expect((await current(page)).elements.find((e: { id: string }) => e.id === arrow.id)).toMatchObject({ x: arrow.x, w: arrow.w, h: 0 })
  await page.keyboard.press('ControlOrMeta+y')

  shapes = (await current(page)).elements
  await saveAndReopen(page, 'Shapes')
  expect((await current(page)).elements).toEqual(shapes)
  await expect(page.locator('.stage svg.el-shape')).toHaveCount(6)
})

test('select several by dragging a box; align, distribute and stacking order, each one undo step', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Escape')
  for (let i = 0; i < 3; i++) {
    await toolbar(page).getByRole('button', { name: 'Shape' }).click()
    await page.getByRole('menu', { name: 'Shape' }).getByRole('menuitem', { name: 'Rectangle', exact: true }).click()
  }
  // Spread them out: paste offsets aside, put them in known places through nudging is slow,
  // so set positions directly, as one undoable change.
  await page.evaluate(() => {
    const s = window.__mySlides!
    s.update((d) => {
      const slide = d.slides.find((x) => x.id === s.getState().slideId)!
      const rects = slide.elements.filter((e) => e.type === 'shape')
      const spots = [{ x: 100, y: 540 }, { x: 600, y: 560 }, { x: 900, y: 570 }]
      rects.forEach((r, i) => Object.assign(r, spots[i], { w: 100, h: 100 }))
    })
  })
  await page.locator('.stage').focus()
  await page.keyboard.press('Escape')
  const ids = (await current(page)).elements.filter((e: { type: string }) => e.type === 'shape').map((e: { id: string }) => e.id)

  // Drag a box from an empty spot across all three rectangles (but not the title placeholders).
  await drag(page, await screen(page, 60, 520), await screen(page, 1060, 700))
  expect((await selection(page)).sort()).toEqual([...ids].sort())
  await expect(page.locator('.sel-box')).toHaveCount(3)

  await toolbar(page).getByRole('button', { name: 'Arrange' }).click()
  await scan(page, 'the arrange menu')
  await page.getByRole('menu', { name: 'Arrange' }).getByRole('menuitem', { name: 'Align top' }).click()
  const rects = async () => (await current(page)).elements.filter((e: { type: string }) => e.type === 'shape')
  expect((await rects()).map((r: { y: number }) => r.y)).toEqual([540, 540, 540])

  await toolbar(page).getByRole('button', { name: 'Arrange' }).click()
  await page.getByRole('menu', { name: 'Arrange' }).getByRole('menuitem', { name: 'Distribute across' }).click()
  expect((await rects()).map((r: { x: number }) => r.x)).toEqual([100, 500, 900])

  // Undo: one step each.
  await page.keyboard.press('ControlOrMeta+z')
  expect((await rects()).map((r: { x: number }) => r.x)).toEqual([100, 600, 900])
  await page.keyboard.press('ControlOrMeta+z')
  expect((await rects()).map((r: { y: number }) => r.y)).toEqual([540, 560, 570])

  // Stacking: the first rectangle to the front, then one step back.
  await page.keyboard.press('Escape')
  await page.locator(`.stage [data-id="${ids[0]}"]`).click()
  expect(await selection(page)).toEqual([ids[0]])
  await toolbar(page).getByRole('button', { name: 'Arrange' }).click()
  await page.getByRole('menu', { name: 'Arrange' }).getByRole('menuitem', { name: 'Bring to front' }).click()
  let order = (await current(page)).elements.map((e: { id: string }) => e.id)
  expect(order.at(-1)).toBe(ids[0])
  await toolbar(page).getByRole('button', { name: 'Arrange' }).click()
  await page.getByRole('menu', { name: 'Arrange' }).getByRole('menuitem', { name: 'Send backward' }).click()
  order = (await current(page)).elements.map((e: { id: string }) => e.id)
  expect(order.slice(-2)).toEqual([ids[0], ids[2]])
  // Drawn in that order on screen too.
  const drawn = await page.locator('.stage .slide-surface > [data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))
  expect(drawn).toEqual(order)
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('ControlOrMeta+z')
  expect((await current(page)).elements.map((e: { id: string }) => e.id).slice(-3)).toEqual(ids)
  expect((await deck(page)).slides).toHaveLength(1)
})
