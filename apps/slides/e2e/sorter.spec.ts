import { expect, test, type Page } from '@playwright/test'
import { deck, open, saveAndReopen, scan } from './helpers'

/** A deck of n title slides, titled S1, S2, ... (one undo step, like any change). */
async function slidesDeck(page: Page, n: number) {
  await page.evaluate((n) => {
    const s = window.__mySlides!
    s.update((d) => {
      const base = JSON.parse(JSON.stringify(d.slides[0]))
      d.slides = Array.from({ length: n }, (_, i) => {
        const slide = JSON.parse(JSON.stringify(base))
        slide.id = `s${i + 1}`
        slide.elements.forEach((e: { id: string }, j: number) => (e.id = `e${i + 1}-${j}`))
        slide.elements[0].content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `S${i + 1}` }] }] }
        return slide
      })
    })
    s.goTo('s1')
  }, n)
}

/** The deck's titles in order: "S1 S2 ...". */
const order = async (page: Page) =>
  (await deck(page)).slides.map((s: { elements: { content: { content: { content?: { text: string }[] }[] } }[] }) => s.elements[0].content.content[0].content?.[0]?.text ?? '?').join(' ')
const seq = (...nums: number[]) => nums.map((n) => `S${n}`).join(' ')
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

const strip = (page: Page) => page.getByRole('listbox', { name: 'Slides' })
const sorter = (page: Page) => page.getByRole('listbox', { name: 'All slides' })
const thumb = (list: ReturnType<typeof strip>, n: number) => list.getByRole('option', { name: `Slide ${n}`, exact: true })
const status = (page: Page) => page.locator('.grid-scroll [role="status"]')

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 8 })
}
const middle = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

test('a 60-slide deck reorders by keyboard in the strip, and undo restores the order', async ({ page }) => {
  await open(page)
  await slidesDeck(page, 60)
  const all = seq(...range(1, 60))
  expect(await order(page)).toBe(all)
  // Only the thumbnails on screen are drawn.
  expect(await strip(page).getByRole('option').count()).toBeLessThan(20)

  await thumb(strip(page), 1).click()
  await expect(thumb(strip(page), 1)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+End')
  expect(await order(page)).toBe(seq(...range(2, 60), 1))
  await expect(status(page)).toHaveText('Slide moved to position 60 of 60')
  // The moved slide stays current and keeps the keyboard, though it is now far down the list.
  await expect(thumb(strip(page), 60)).toBeFocused()
  await expect(thumb(strip(page), 60)).toHaveAttribute('aria-current', 'true')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+ArrowUp')
  expect(await order(page)).toBe(seq(...range(2, 57), 1, 58, 59, 60))
  await expect(status(page)).toHaveText('Slide moved to position 57 of 60')

  // Shift+Down picks two more; Ctrl+Home moves all three to the front, in order.
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(strip(page).locator('[aria-selected="true"]')).toHaveCount(3)
  await page.keyboard.press('ControlOrMeta+Home')
  expect(await order(page)).toBe(seq(1, 58, 59, ...range(2, 57), 60))
  await expect(status(page)).toHaveText('3 slides moved to position 1 of 60')

  // Every move was one undo step.
  for (let i = 0; i < 5; i++) await page.keyboard.press('ControlOrMeta+z')
  expect(await order(page)).toBe(all)
  await page.keyboard.press('ControlOrMeta+y')
  expect(await order(page)).toBe(seq(...range(2, 60), 1))
})

test('a 60-slide deck reorders by drag in the strip and in the sorter, and undo restores the order', async ({ page }) => {
  await open(page)
  await slidesDeck(page, 60)
  const all = seq(...range(1, 60))

  // Strip: drag slide 5 up between slides 1 and 2. The marker shows where it will land.
  const five = (await thumb(strip(page), 5).boundingBox())!
  const one = (await thumb(strip(page), 1).boundingBox())!
  await dragTo(page, middle(five), { x: one.x + one.width / 2, y: one.y + one.height + 4 })
  await expect(page.locator('.drop-marker')).toBeVisible()
  await expect(strip(page).locator('.grid-cell.is-dragged')).toHaveCount(1)
  await page.mouse.up()
  await expect(page.locator('.drop-marker')).toHaveCount(0)
  expect(await order(page)).toBe(seq(1, 5, 2, 3, 4, ...range(6, 60)))

  // Esc during a drag puts nothing anywhere.
  await dragTo(page, middle((await thumb(strip(page), 3).boundingBox())!), middle(one))
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await order(page)).toBe(seq(1, 5, 2, 3, 4, ...range(6, 60)))

  // Sorter: Ctrl+click picks slides 2 and 4 (S5 and S3); drag them past the end of the deck.
  await page.getByRole('button', { name: 'Slide sorter' }).click()
  await expect(sorter(page)).toBeVisible()
  await scan(page, 'the slide sorter')
  expect(await sorter(page).getByRole('option').count()).toBeLessThan(40)
  await thumb(sorter(page), 2).click()
  await thumb(sorter(page), 4).click({ modifiers: ['ControlOrMeta'] })
  await expect(page.getByText('2 of 60 slides picked')).toBeVisible()
  const grid = (await page.locator('.grid-sorter').boundingBox())!
  await dragTo(page, middle((await thumb(sorter(page), 2).boundingBox())!), { x: grid.x + grid.width / 2, y: grid.y + grid.height - 10 })
  // Held near the bottom edge, the list scrolls by itself until the last slide shows.
  await expect(thumb(sorter(page), 60)).toBeInViewport()
  const last = (await thumb(sorter(page), 60).boundingBox())!
  await page.mouse.move(last.x + last.width - 2, last.y + last.height / 2, { steps: 4 })
  await page.mouse.up()
  expect(await order(page)).toBe(seq(1, 2, 4, ...range(6, 60), 5, 3))
  await expect(status(page)).toHaveText('2 slides moved to position 59 of 60')

  // Undo, from right there, takes back each drag.
  await page.keyboard.press('ControlOrMeta+z')
  expect(await order(page)).toBe(seq(1, 5, 2, 3, 4, ...range(6, 60)))
  await page.keyboard.press('ControlOrMeta+z')
  expect(await order(page)).toBe(all)
})

test('sorter: pick with Shift and Ctrl, delete and duplicate several, open a slide with Enter, Esc goes back', async ({ page }) => {
  await open(page)
  await slidesDeck(page, 8)
  await page.getByRole('button', { name: 'Slide sorter' }).click()
  await expect(thumb(sorter(page), 1)).toBeFocused()

  // Shift+click picks a run; the grid's columns make Down jump a row.
  await thumb(sorter(page), 2).click()
  await thumb(sorter(page), 4).click({ modifiers: ['Shift'] })
  await expect(sorter(page).locator('[aria-selected="true"]')).toHaveCount(3)
  await page.getByRole('button', { name: 'Duplicate 3 slides' }).click()
  expect(await order(page)).toBe(seq(1, 2, 3, 4, 2, 3, 4, 5, 6, 7, 8))
  // The copies are picked: delete them with the key.
  await expect(sorter(page).locator('[aria-selected="true"]')).toHaveCount(3)
  await page.keyboard.press('Delete')
  expect(await order(page)).toBe(seq(...range(1, 8)))
  await expect(status(page)).toHaveText('3 slides deleted')

  // Ctrl+A, then Delete keeps one slide: a deck always has one. Undo brings them all back.
  await page.keyboard.press('ControlOrMeta+a')
  await expect(page.getByText('8 of 8 slides picked')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete 8 slides' })).toBeDisabled()
  await page.keyboard.press('Delete')
  expect(await order(page)).toBe('S1')
  await page.keyboard.press('ControlOrMeta+z')
  expect(await order(page)).toBe(seq(...range(1, 8)))

  // Arrows move between slides; Enter opens one in the editor.
  await thumb(sorter(page), 1).click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(thumb(sorter(page), 3)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main', { name: 'Slide editor' })).toBeVisible()
  await expect(page.getByText('Slide 3 of 8')).toBeVisible()

  // Esc in the sorter goes back to the editor too.
  await page.getByRole('button', { name: 'Slide sorter' }).click()
  await expect(thumb(sorter(page), 3)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('main', { name: 'Slide editor' })).toBeVisible()
  await expect(page.locator('.stage')).toBeFocused()
})

test('strip: duplicate and move from the menu and Ctrl+D; Ctrl+D on the canvas copies the slide', async ({ page }) => {
  await open(page)
  await slidesDeck(page, 3)
  await thumb(strip(page), 2).click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Slide' })
  await expect(menu.getByRole('menuitem', { name: 'New slide' })).toBeFocused()
  await scan(page, 'the slide menu')
  await menu.getByRole('menuitem', { name: 'Duplicate slide' }).click()
  expect(await order(page)).toBe(seq(1, 2, 2, 3))
  await expect(page.getByText('Slide 3 of 4')).toBeVisible()
  await expect(thumb(strip(page), 3)).toBeFocused()

  // The copy has its own ids, so editing it leaves the original alone.
  const d = await deck(page)
  expect(d.slides[2].id).not.toBe(d.slides[1].id)
  expect(d.slides[2].elements[0].id).not.toBe(d.slides[1].elements[0].id)

  await page.keyboard.press('ContextMenu')
  await page.getByRole('menuitem', { name: 'Move later' }).click()
  expect(await order(page)).toBe(seq(1, 2, 3, 2))

  // On the canvas with nothing selected, Ctrl+D duplicates the slide.
  await page.locator('.stage').focus()
  await page.keyboard.press('ControlOrMeta+d')
  expect(await order(page)).toBe(seq(1, 2, 3, 2, 2))
  await expect(page.getByText('Slide 5 of 5')).toBeVisible()
  await thumb(strip(page), 5).focus()
  await page.keyboard.press('ControlOrMeta+d')
  expect(await order(page)).toBe(seq(1, 2, 3, 2, 2, 2))
})

test('notes: typed, undone a run at a time, kept per slide, saved and reopened', async ({ page }) => {
  await open(page)
  await slidesDeck(page, 2)
  const notes = page.getByRole('textbox', { name: 'Speaker notes for slide 1' })
  await notes.click()
  await page.keyboard.type('Open with the question')
  // A pause, then more: two runs of typing, two undo steps.
  await page.waitForTimeout(1200)
  await page.keyboard.press('Enter')
  await page.keyboard.type('from last class.')
  await expect(notes).toHaveValue('Open with the question\nfrom last class.')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(notes).toHaveValue('Open with the question')
  await page.keyboard.press('ControlOrMeta+y')
  await expect(notes).toHaveValue('Open with the question\nfrom last class.')

  // Each slide has its own notes.
  await thumb(strip(page), 2).click()
  const second = page.getByRole('textbox', { name: 'Speaker notes for slide 2' })
  await expect(second).toHaveValue('')
  await second.fill('Show the diagram.')
  await thumb(strip(page), 1).click()
  await expect(notes).toHaveValue('Open with the question\nfrom last class.')

  // Undo from the strip reaches the notes too.
  await thumb(strip(page), 1).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByText('Slide 2 of 2')).toBeVisible()
  await expect(second).toHaveValue('')
  await page.keyboard.press('ControlOrMeta+y')
  await expect(second).toHaveValue('Show the diagram.')

  await saveAndReopen(page, 'Notes')
  const reopened = await deck(page)
  expect(reopened.slides.map((s: { notes: string }) => s.notes)).toEqual(['Open with the question\nfrom last class.', 'Show the diagram.'])
  await expect(page.getByRole('textbox', { name: 'Speaker notes for slide 1' })).toHaveValue('Open with the question\nfrom last class.')

  // The pane folds away, and stays folded.
  await page.getByRole('button', { name: 'Notes' }).click()
  await expect(page.getByRole('textbox', { name: /Speaker notes/ })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-expanded', 'false')
})
