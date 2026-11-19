import { expect, test, type Page } from '@playwright/test'
import { deck, makePicture, open, scan } from './helpers'

// Spec, Phase 8: a full deck can be built and presented with the keyboard alone. No mouse in
// this file: Tab and Shift+Tab move between controls as a keyboard user does, Enter and arrows
// do the rest.

/** Press Tab (or Shift+Tab) until the focused control has this accessible name. */
async function tabTo(page: Page, name: string | RegExp, back = false) {
  const seen: string[] = []
  for (let i = 0; i < 80; i++) {
    const current = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el ? el.getAttribute('aria-label') || el.textContent?.trim() || '' : ''
    })
    if (typeof name === 'string' ? current === name : name.test(current)) return
    seen.push(current.slice(0, 30))
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab')
  }
  throw new Error(`Tab never reached "${name}": ${[...new Set(seen)].join(' | ')}`)
}

/** Open a menu bar menu and pick an item, keyboard only: F10 to the menu bar, then Tab. */
async function menu(page: Page, menuName: string, item: string) {
  await page.keyboard.press('F10')
  await tabTo(page, menuName)
  await page.keyboard.press('Enter')
  const panel = page.getByRole('menu', { name: menuName })
  await expect(panel).toBeVisible()
  for (let i = 0; i < 40; i++) {
    const label = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.querySelector('.menu-label')?.textContent ?? '')
    if (label === item) {
      await page.keyboard.press('Enter')
      return
    }
    await page.keyboard.press('ArrowDown')
  }
  throw new Error(`No "${item}" in the ${menuName} menu`)
}

const types = async (page: Page, slide: number) => (await deck(page)).slides[slide].elements.map((e: { type: string }) => e.type).sort()

test('build a full deck and present it with the keyboard alone', async ({ page }) => {
  test.setTimeout(120_000)
  const photo = await (async () => {
    await page.goto('/')
    return makePicture(page, 1200, 900)
  })()
  await open(page)

  // Title slide: the caret starts in the title.
  await page.keyboard.type('Volcanoes')
  await page.keyboard.press('Escape') // done typing; the box stays selected
  await page.keyboard.press('Tab') // the next item: the subtitle
  await page.keyboard.press('Enter')
  await page.keyboard.type('Earth science, period 3')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // A content slide with a title and bullet text.
  await page.keyboard.press('ControlOrMeta+m')
  await page.locator('.stage').focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.keyboard.type('How they form')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Magma rises through cracks')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // A table from the Insert menu, filled in with Tab.
  await menu(page, 'Insert', 'Table…')
  const size = page.getByRole('dialog', { name: 'Insert table' })
  await expect(size).toBeVisible()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('2')
  await page.keyboard.press('Tab')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('2')
  await page.keyboard.press('Enter')
  for (const t of ['Volcano', 'Height', 'Etna']) {
    await page.keyboard.type(t)
    await page.keyboard.press('Tab')
  }
  await page.keyboard.type('3357')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // A chart: the data window, typed into and applied from the keyboard.
  await menu(page, 'Insert', 'Chart…')
  const chart = page.getByRole('dialog', { name: 'New chart' })
  await expect(chart).toBeVisible()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Etna')
  await tabTo(page, 'Insert chart')
  await page.keyboard.press('Enter')
  await expect(chart).toHaveCount(0)
  await page.keyboard.press('Escape')

  // A shape: inserted, moved with arrows, made bigger with Ctrl+Shift+arrows.
  await menu(page, 'Insert', 'Oval')
  const before = (await deck(page)).slides[1].elements.at(-1)
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('ControlOrMeta+Shift+ArrowRight')
  await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
  const after = (await deck(page)).slides[1].elements.at(-1)
  expect([after.x, after.w, after.h]).toEqual([before.x - 10, before.w + 10, before.h + 10])
  // ...and placed exactly from Arrange, Size and position.
  await menu(page, 'Arrange', 'Size and position…')
  const box = page.getByRole('dialog', { name: 'Size and position' })
  await scan(page, 'the size and position window')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('1000')
  await page.keyboard.press('Enter')
  expect((await deck(page)).slides[1].elements.at(-1).x).toBe(1000)
  await expect(box).toHaveCount(0)
  await page.keyboard.press('Escape')

  // A picture (the file picker is the system's own window, which the test answers).
  const chooser = page.waitForEvent('filechooser')
  await menu(page, 'Insert', 'Picture…')
  await (await chooser).setFiles({ name: 'etna.jpg', mimeType: 'image/jpeg', buffer: photo })
  await expect(page.locator('.stage img.el-image')).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await types(page, 1)).toEqual(['chart', 'image', 'shape', 'table', 'text', 'text'])

  // Theme and transition from the menus.
  await menu(page, 'Format', 'Garden')
  expect((await deck(page)).theme.id).toBe('garden')
  await menu(page, 'Slide', 'Fade in')
  expect((await deck(page)).slides[1].transition).toBe('fade')

  // Speaker notes: Tab to the notes box.
  await page.locator('.stage').focus()
  await tabTo(page, 'Speaker notes for slide 2')
  await page.keyboard.type('Mention the 2021 eruption.')
  expect((await deck(page)).slides[1].notes).toBe('Mention the 2021 eruption.')

  // Reorder in the strip: the content slide moves to the front, and back.
  await page.locator('.stage').focus()
  await tabTo(page, 'Slide 2', true)
  await page.keyboard.press('ControlOrMeta+ArrowUp')
  expect((await deck(page)).slides[0].notes).toBe('Mention the 2021 eruption.')
  await page.keyboard.press('ControlOrMeta+z')

  // Present it start to finish.
  await page.keyboard.press('F5')
  await expect(page.locator('.present-stage')).toHaveAttribute('data-shown', '0')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.present-stage')).toHaveAttribute('data-shown', '1')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.present-end')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.present')).toHaveCount(0)
  await expect(page.locator('.stage')).toBeFocused()
})

test('the menus, and the windows they open, pass the accessibility scan', async ({ page }) => {
  test.setTimeout(90_000) // eight scans
  await open(page)
  await page.keyboard.press('Escape')
  for (const name of ['File', 'Insert', 'Format', 'Arrange', 'Slide']) {
    await page.keyboard.press('F10')
    await tabTo(page, name)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu', { name })).toBeVisible()
    await scan(page, `the ${name} menu`)
    await page.keyboard.press('Escape')
  }
  await menu(page, 'File', 'About MySlides')
  await expect(page.getByRole('dialog', { name: 'About MySlides' })).toContainText('Bright Logic LLC')
  await scan(page, 'About MySlides')
  await page.keyboard.press('Escape')
  await menu(page, 'Insert', 'Table…')
  await scan(page, 'the Insert table window')
})
