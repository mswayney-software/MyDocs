import { expect, test, type Page } from '@playwright/test'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const deck = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__mySlides!.getState().deck)))
const ui = (page: Page) =>
  page.evaluate(() => {
    const s = window.__mySlidesCanvas!.getState()
    return { selected: s.selected, editingId: s.editingId }
  })
const current = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__mySlides!.currentSlide())))
const thumbs = (page: Page) => page.getByRole('navigation', { name: 'Slides' }).locator('.strip-thumb')
const live = (page: Page) => page.locator('.el-live .ProseMirror')

async function open(page: Page) {
  // Count live editors for the whole test: there must never be more than one.
  await page.addInitScript(() => {
    const w = window as unknown as { maxEditors: number }
    w.maxEditors = 0
    new MutationObserver(() => {
      w.maxEditors = Math.max(w.maxEditors, document.querySelectorAll('.ProseMirror').length)
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Untitled deck' })).toBeVisible()
  // A new deck opens with the cursor in the title.
  await expect(live(page)).toBeFocused()
}

/** Screen point for a slide-unit point. */
async function screen(page: Page, x: number, y: number) {
  const r = (await page.locator('.slide-layer').boundingBox())!
  const scale = r.width / 1280
  return { x: r.x + x * scale, y: r.y + y * scale, scale }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.mouse.up()
}

const maxEditors = (page: Page) => page.evaluate(() => (window as unknown as { maxEditors: number }).maxEditors)

test('build three slides with formatted text, move and resize a box, then undo every step back to an empty deck', async ({ page }) => {
  await open(page)
  const empty = await deck(page)

  // Title, typed straight away, then bold.
  await page.keyboard.type('Cell Division')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.press('Escape')
  let slide = await current(page)
  expect(slide.elements[0].content.content[0].content[0]).toMatchObject({ text: 'Cell Division', marks: [{ type: 'bold' }] })

  // Three more slides; on the last, a text box with a bulleted list in a bigger size.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+m')
  await expect(thumbs(page)).toHaveCount(4)
  await page.getByRole('button', { name: 'Text box' }).click()
  await page.keyboard.type('Prophase')
  await page.getByRole('button', { name: 'Bulleted list' }).click()
  await page.getByLabel('Font size').selectOption('32')
  await page.keyboard.type(' and metaphase')
  await page.keyboard.press('Escape')
  slide = await current(page)
  const box = slide.elements[2]
  expect(box.content.content[0].type).toBe('bulletList')
  expect(JSON.stringify(box.content)).toContain('"fontSize":"32pt"')

  // Move it 200 units right, then resize from the bottom-right corner.
  const start = await screen(page, box.x + box.w / 2, box.y + box.h / 2)
  const end = await screen(page, box.x + box.w / 2 + 200, box.y + box.h / 2 + 37)
  await drag(page, start, end)
  // Mouse positions are whole screen pixels: allow one pixel's worth of slide units.
  const px = 1 / start.scale
  let moved = (await current(page)).elements[2]
  expect(Math.abs(moved.x - (box.x + 200))).toBeLessThanOrEqual(px)
  expect(Math.abs(moved.y - (box.y + 37))).toBeLessThanOrEqual(px)
  const corner = await screen(page, moved.x + moved.w, moved.y + moved.h)
  await drag(page, corner, { x: corner.x + 60 * corner.scale, y: corner.y + 50 * corner.scale })
  const resized = (await current(page)).elements[2]
  expect(Math.abs(resized.w - (moved.w + 60))).toBeLessThanOrEqual(px)
  expect(Math.abs(resized.h - (moved.h + 50))).toBeLessThanOrEqual(px)
  moved = resized

  // Undo everything. Each action was one step (a drag is one step, not one per frame).
  await page.locator('.stage').focus()
  let steps = 0
  while (await page.evaluate(() => window.__mySlides!.getState().canUndo)) {
    await page.keyboard.press('ControlOrMeta+z')
    steps++
    expect(steps).toBeLessThan(20)
  }
  // Title text, 3 slides, text box insert, its text, move, resize.
  expect(steps).toBe(8)
  const after = await deck(page)
  expect(after.slides).toEqual(empty.slides)
  await expect(thumbs(page)).toHaveCount(1)
  // And redo brings it all back.
  for (let i = 0; i < steps; i++) await page.keyboard.press('ControlOrMeta+y')
  expect((await deck(page)).slides).toHaveLength(4)
  expect(await maxEditors(page)).toBe(1)
})

test('only one text editor exists at any time', async ({ page }) => {
  await open(page)
  await page.keyboard.type('One')
  // Click into the subtitle while the title is being edited: the title closes first.
  const sub = (await current(page)).elements[1]
  const p = await screen(page, sub.x + 40, sub.y + 30)
  await page.mouse.dblclick(p.x, p.y)
  await expect(live(page)).toHaveCount(1)
  await page.keyboard.type('Two')
  await page.keyboard.press('ControlOrMeta+m')
  await page.getByRole('button', { name: 'Text box' }).click()
  await page.keyboard.type('Three')
  await thumbs(page).first().click()
  await expect(live(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Text box' }).click()
  await page.keyboard.type('Four')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('Enter') // edit the selected box again
  await expect(live(page)).toHaveCount(1)
  expect(await maxEditors(page)).toBe(1)
  // And the canvas, strip and thumbnails never use an editor to show text.
  await page.keyboard.press('Escape')
  await expect(page.locator('.ProseMirror')).toHaveCount(0)
})

/** Where each line of text sits in a text box, in slide units (relative to the box). */
async function textLayout(page: Page, boxSelector: string, scale: number) {
  return page.locator(boxSelector).evaluate((box, s) => {
    const origin = box.getBoundingClientRect()
    const range = document.createRange()
    const out: number[][] = []
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      range.selectNodeContents(n)
      for (const r of range.getClientRects()) {
        out.push([r.left, r.top, r.width, r.height].map((v, i) => Math.round(((v - (i === 0 ? origin.left : i === 1 ? origin.top : 0)) / s) * 2) / 2))
      }
    }
    return out
  }, scale)
}

test('text looks the same while typing, on the slide, in the thumbnail, and after save and reopen', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await open(page)
  await page.getByRole('button', { name: 'Text box' }).click()
  await page.keyboard.type('A list of the phases of mitosis, long enough to wrap onto a second line in this box')
  await page.getByRole('button', { name: 'Bulleted list' }).click()
  await page.keyboard.press('Enter')
  await page.getByLabel('Font', { exact: true }).selectOption('Tinos')
  await page.keyboard.type('Prophase ')
  await page.keyboard.press('ControlOrMeta+i')
  await page.keyboard.type('and metaphase')
  await page.getByLabel('Line spacing').selectOption('1.5')
  const id = (await ui(page)).editingId!
  const { scale } = await screen(page, 0, 0)

  const editing = await textLayout(page, '.el-live', scale)
  expect(editing.length).toBeGreaterThanOrEqual(4) // the first item wraps
  await page.keyboard.press('Escape')
  const onSlide = await textLayout(page, `.stage .slide-surface .el-text[data-id="${id}"]`, scale)
  expect(onSlide).toEqual(editing)

  const thumb = page.locator('.strip-thumb[aria-current="true"]')
  const thumbScale = ((await thumb.boundingBox())!.width - 4) / 1280
  const inThumb = await textLayout(page, `.strip-thumb[aria-current="true"] .el-text[data-id="${id}"]`, thumbScale)
  // A thumbnail is the same layout, shrunk: positions agree to within a unit.
  expect(inThumb.length).toBe(onSlide.length)
  inThumb.forEach((r, i) => r.forEach((v, j) => expect(Math.abs(v - onSlide[i][j])).toBeLessThanOrEqual(1)))

  // Save, start over, reopen.
  await page.keyboard.press('ControlOrMeta+s')
  const dialog = page.getByRole('dialog', { name: 'Save as' })
  await dialog.getByLabel('File name').fill('Layout')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download' }).click()
  // Under the name a student would see (downloads arrive under a random temporary name).
  const path = join(mkdtempSync(join(tmpdir(), 'myslides-')), 'Layout.myslides')
  copyFileSync((await (await download).path())!, path)
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Escape') // leave the new title
  await page.keyboard.press('ControlOrMeta+o')
  await (await chooser).setFiles(path)
  await expect(page.locator('.file-name')).toHaveText('Layout')
  const reopened = await textLayout(page, `.stage .slide-surface .el-text[data-id="${id}"]`, scale)
  expect(reopened).toEqual(onSlide)
})

test('dragging near the middle snaps to the slide center and shows a guide', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Text box' }).click()
  await page.keyboard.type('Centered')
  await page.keyboard.press('Escape')
  const box = (await current(page)).elements[2] // 340, 310, 600 × 100
  // Drag so the center lands 3 units right of the slide's center (640): it snaps to 640.
  const from = await screen(page, box.x + 100, box.y + 50)
  const to = await screen(page, box.x + 100 + 3, box.y + 50 + 120)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await expect(page.locator('.guide-v')).toHaveCount(1)
  await page.mouse.up()
  await expect(page.locator('.guide')).toHaveCount(0)
  const moved = (await current(page)).elements[2]
  expect(moved.x + moved.w / 2).toBe(640)
})

test('keyboard: arrows nudge (one undo step per run), Delete removes, copy and paste offset the copy', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Tab') // selects the first item on the slide
  const [id] = (await ui(page)).selected
  const before = (await current(page)).elements.find((e: { id: string }) => e.id === id)
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  let el = (await current(page)).elements.find((e: { id: string }) => e.id === id)
  expect([el.x, el.y]).toEqual([before.x + 5, before.y + 10])
  await page.keyboard.press('ControlOrMeta+z')
  el = (await current(page)).elements.find((e: { id: string }) => e.id === id)
  expect([el.x, el.y]).toEqual([before.x, before.y])

  await page.keyboard.press('ControlOrMeta+c')
  await page.keyboard.press('ControlOrMeta+v')
  let els = (await current(page)).elements
  expect(els).toHaveLength(3)
  expect([els[2].x, els[2].y]).toEqual([before.x + 20, before.y + 20])
  expect(els[2].id).not.toBe(id)
  await page.keyboard.press('Delete')
  els = (await current(page)).elements
  expect(els).toHaveLength(2)
  await page.keyboard.press('ControlOrMeta+z')
  expect((await current(page)).elements).toHaveLength(3)
})

test('Ctrl+Shift+S is Save as and never strikes text through; Ctrl+Shift+X strikes', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await open(page)
  await page.keyboard.type('Not struck')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+Shift+s')
  const dialog = page.getByRole('dialog', { name: 'Save as' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(JSON.stringify((await current(page)).elements[0].content)).not.toContain('strike')

  const title = (await current(page)).elements[0]
  const p = await screen(page, title.x + 60, title.y + title.h - 30)
  await page.mouse.dblclick(p.x, p.y)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+Shift+x')
  await page.keyboard.press('Escape')
  expect(JSON.stringify((await current(page)).elements[0].content)).toContain('"strike"')
})

test('typing right after Text box loses no keys', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Text box' }).click()
  await page.keyboard.type('Mitosis has four phases')
  await page.keyboard.press('Escape')
  const els = (await current(page)).elements
  expect(els[2].content.content[0].content[0].text).toBe('Mitosis has four phases')
})

test('slide strip: add and delete slides from the menu and the keyboard; the last slide stays', async ({ page }) => {
  await open(page)
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+m')
  await page.keyboard.press('ControlOrMeta+m')
  await expect(thumbs(page)).toHaveCount(3)
  await expect(page.getByText('Slide 3 of 3')).toBeVisible()

  await thumbs(page).nth(1).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete slide' }).click()
  await expect(thumbs(page)).toHaveCount(2)

  await thumbs(page).first().click()
  await thumbs(page).first().press('Delete')
  await expect(thumbs(page)).toHaveCount(1)
  await thumbs(page).first().click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Delete slide' })).toBeDisabled()
  await page.keyboard.press('Escape')

  // Undo works right there in the strip.
  await thumbs(page).first().press('ControlOrMeta+z')
  await expect(thumbs(page)).toHaveCount(2)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(thumbs(page)).toHaveCount(3)
})
