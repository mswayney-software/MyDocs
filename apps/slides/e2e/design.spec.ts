import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const deck = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__mySlides!.getState().deck)))
const live = (page: Page) => page.locator('.el-live .ProseMirror')
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Slide tools' })
const surfaces = (page: Page) => page.locator('.strip-thumb .slide-surface')

async function open(page: Page) {
  // No write-back, so saving downloads (same in every browser).
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await page.goto('/')
  await expect(live(page)).toBeFocused()
}

async function scan(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), what).toEqual([])
}

async function saveAndReopen(page: Page, name: string) {
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

test('switching theme restyles every slide, and one Ctrl+Z restores the old theme', async ({ page }) => {
  await open(page)
  await page.keyboard.type('Photosynthesis')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+m')
  await page.keyboard.press('ControlOrMeta+m')
  await expect(surfaces(page)).toHaveCount(3)
  await page.locator('.strip-thumb').first().click()
  await page.locator('.stage').focus()

  await toolbar(page).getByRole('button', { name: 'Theme' }).click()
  const menu = page.getByRole('menu', { name: 'Theme' })
  await expect(menu.getByRole('menuitemradio')).toHaveCount(6)
  await expect(menu.getByRole('menuitemradio', { name: 'Plain' })).toHaveAttribute('aria-checked', 'true')
  // Each choice previews the current slide, title text included.
  await expect(menu.locator('.design-preview').first()).toContainText('Photosynthesis')
  await scan(page, 'the theme picker')
  await menu.getByRole('menuitemradio', { name: 'Chalk' }).click()

  const chalk = await page.evaluate(() => window.__mySlides!.getState().deck.theme)
  expect(chalk.id).toBe('chalk')
  // Every slide, not just this one: thumbnails and the canvas take the new background.
  const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
  for (let i = 0; i < 3; i++) await expect(surfaces(page).nth(i)).toHaveCSS('background-color', rgb(chalk.colors.background))
  await expect(page.locator('.stage .slide-surface')).toHaveCSS('background-color', rgb(chalk.colors.background))
  const title = page.locator('.strip-thumb').first().locator('.el-text').first()
  await expect(title).toHaveCSS('color', rgb(chalk.colors.heading))
  await expect(title).toHaveCSS('font-family', /Atkinson Hyperlegible/)

  // One step back.
  await page.locator('.stage').focus()
  await page.keyboard.press('ControlOrMeta+z')
  expect((await deck(page)).theme.id).toBe('plain')
  for (let i = 0; i < 3; i++) await expect(surfaces(page).nth(i)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect((await deck(page)).slides).toHaveLength(3) // only the theme came back
  await page.keyboard.press('ControlOrMeta+y')
  expect((await deck(page)).theme.id).toBe('chalk')
})

test('layouts rearrange the slide without losing text; background follows the theme; all survive save and reopen', async ({ page }) => {
  await open(page)
  await page.keyboard.type('Cells')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+m') // Title and content
  await page.locator('.stage').focus()

  await toolbar(page).getByRole('button', { name: 'Layout' }).click()
  const menu = page.getByRole('menu', { name: 'Layout' })
  await expect(menu.locator('.design-name')).toHaveText(['Title', 'Section', 'Title and content', 'Two columns', 'Title only', 'Blank'])
  await expect(menu.getByRole('menuitemradio', { name: 'Title and content' })).toHaveAttribute('aria-checked', 'true')
  await scan(page, 'the layout picker')
  await menu.getByRole('menuitemradio', { name: 'Two columns' }).click()
  let slide = (await deck(page)).slides[1]
  expect(slide.layout).toBe('two-columns')
  expect(slide.elements.map((e: { role: string }) => e.role)).toEqual(['title', 'body', 'body2'])

  // Type in the right column, then go to Title only: that text stays, the empty left column goes.
  await page.locator(`.stage .el-text[data-id="${slide.elements[2].id}"]`).dblclick()
  await page.keyboard.type('Nucleus')
  await page.keyboard.press('Escape') // done typing; the box stays selected
  await page.keyboard.press('Escape') // nothing selected: the toolbar shows the slide's tools
  await toolbar(page).getByRole('button', { name: 'Layout' }).click()
  await page.getByRole('menu', { name: 'Layout' }).getByRole('menuitemradio', { name: 'Title only' }).click()
  slide = (await deck(page)).slides[1]
  expect(slide.elements.map((e: { role: string }) => e.role)).toEqual(['title', 'body2'])
  await expect(page.locator('.stage .slide-surface')).toContainText('Nucleus')
  await page.keyboard.press('ControlOrMeta+z')
  expect((await deck(page)).slides[1].layout).toBe('two-columns')
  await page.keyboard.press('ControlOrMeta+y')

  // Background from the theme: it changes when the theme does.
  await toolbar(page).getByRole('button', { name: 'Slide background' }).click()
  await scan(page, 'the background color picker')
  await page.getByRole('dialog', { name: 'Slide background' }).getByRole('button', { name: 'Accent 1' }).click()
  expect((await deck(page)).slides[1].background).toBe('accent1')
  await expect(page.locator('.stage .slide-surface')).toHaveCSS('background-color', 'rgb(31, 122, 140)')
  await toolbar(page).getByRole('button', { name: 'Theme' }).click()
  await page.getByRole('menu', { name: 'Theme' }).getByRole('menuitemradio', { name: 'Midnight' }).click()
  await expect(page.locator('.stage .slide-surface')).toHaveCSS('background-color', 'rgb(96, 165, 250)')
  // The first slide keeps the theme background.
  await expect(surfaces(page).first()).toHaveCSS('background-color', 'rgb(17, 24, 39)')

  const before = await deck(page)
  await saveAndReopen(page, 'Design')
  const after = await deck(page)
  expect(after.theme).toEqual(before.theme)
  expect(after.slides.map((s: { layout: string; background: string | null }) => [s.layout, s.background])).toEqual(
    before.slides.map((s: { layout: string; background: string | null }) => [s.layout, s.background]),
  )
  await expect(page.locator('.stage .slide-surface')).toContainText('Cells')
})
