import { expect, test, type Page } from '@playwright/test'
import { current, deck, live, open, scan } from './helpers'

/** A deck of `n` slides, each titled "Slide N", with notes. */
async function slides(page: Page, n: number) {
  await live(page).pressSequentially('Slide 1')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  for (let i = 2; i <= n; i++) {
    await page.keyboard.press('ControlOrMeta+m')
    await page.evaluate((i) => {
      const s = window.__mySlides!
      const slide = s.currentSlide()
      s.update((d) => {
        const t = d.slides.find((x) => x.id === slide.id)!
        const title = t.elements.find((e) => e.type === 'text' && e.role === 'title')
        if (title && title.type === 'text') {
          title.content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Slide ${i}` }] }] }
        }
        t.notes = `Notes for slide ${i}`
      })
    }, i)
  }
}

const shown = (page: Page, scope = '.present') => page.locator(`${scope} .present-stage`).first()

test('Present: keys, click, blank, the end screen, and back to the editor', async ({ page }) => {
  await open(page)
  await slides(page, 3)
  await page.getByRole('button', { name: 'Present', exact: true }).click()
  const screen = page.locator('.present')
  await expect(screen).toBeVisible()
  await expect(page.locator('.app')).toBeHidden()
  await expect(shown(page)).toHaveAttribute('data-shown', '0')
  await expect(screen.locator('.present-layer[data-index="0"]')).toContainText('Slide 1')

  await page.keyboard.press('ArrowRight')
  await expect(shown(page)).toHaveAttribute('data-shown', '1')
  await page.keyboard.press('Space')
  await expect(shown(page)).toHaveAttribute('data-shown', '2')
  await page.keyboard.press('PageUp')
  await expect(shown(page)).toHaveAttribute('data-shown', '1')

  // B blanks; moving on lifts it first, on the same slide.
  await page.keyboard.press('b')
  await expect(page.getByRole('img', { name: 'Screen blanked' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('img', { name: 'Screen blanked' })).toHaveCount(0)
  await expect(shown(page)).toHaveAttribute('data-shown', '1')

  // A click moves on; past the last slide comes the end screen.
  await page.mouse.click(400, 300)
  await expect(shown(page)).toHaveAttribute('data-shown', '2')
  await page.mouse.click(400, 300)
  await expect(screen.locator('.present-end')).toHaveText('End of presentation')

  // Esc goes back to the editor, on the slide that was showing.
  await page.keyboard.press('Escape')
  await expect(screen).toHaveCount(0)
  await expect(page.locator('.app')).toBeVisible()
  expect((await current(page)).notes).toBe('Notes for slide 3')
})

test('Present from this slide, and the bar that shows on a mouse move', async ({ page }) => {
  await open(page)
  await slides(page, 3)
  await page.getByRole('option', { name: 'Slide 2', exact: true }).click()
  await page.getByRole('button', { name: 'More ways to present' }).click()
  await page.getByRole('menuitem', { name: 'Present from this slide' }).click()
  await expect(shown(page)).toHaveAttribute('data-shown', '1')

  const bar = page.getByRole('toolbar', { name: 'Presentation controls' })
  await expect(bar).toHaveCSS('opacity', '0')
  await page.mouse.move(200, 200)
  await page.mouse.move(260, 240)
  await expect(bar).toHaveCSS('opacity', '1')
  await expect(bar).toContainText('2 / 3')
  await bar.getByRole('button', { name: 'Next slide' }).click()
  await expect(shown(page)).toHaveAttribute('data-shown', '2')
  await bar.getByRole('button', { name: 'Previous slide' }).click()
  await bar.getByRole('button', { name: 'Previous slide' }).click()
  await expect(shown(page)).toHaveAttribute('data-shown', '0')
  await scan(page, 'presenting')
  await bar.getByRole('button', { name: 'End presentation' }).click()
  await expect(page.locator('.present')).toHaveCount(0)
})

test('F5 presents from the start and Shift+F5 from this slide, without reloading', async ({ page }) => {
  await open(page)
  await slides(page, 2)
  await page.locator('.stage').focus()
  await page.keyboard.press('Shift+F5')
  await expect(shown(page)).toHaveAttribute('data-shown', '1')
  // In full screen, Esc goes to the browser first; the presentation ends when full screen does.
  await page.keyboard.press('Escape')
  await expect(page.locator('.present')).toHaveCount(0)
  await page.keyboard.press('F5')
  await expect(shown(page)).toHaveAttribute('data-shown', '0')
  await page.keyboard.press('Escape')
  // Still the same page: the deck is still here.
  expect((await deck(page)).slides).toHaveLength(2)
})

test('transitions: pick one for a slide or for every slide; they play when presenting', async ({ page }) => {
  await open(page)
  await slides(page, 3)
  await page.locator('.stage').focus()
  await page.getByRole('button', { name: 'Transition' }).click()
  await page.getByRole('menuitemradio', { name: 'Fade in' }).click()
  expect((await deck(page)).slides.map((s: { transition: string }) => s.transition)).toEqual(['none', 'none', 'fade'])
  await page.getByRole('button', { name: 'Transition' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Fade in' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemradio', { name: 'Slide in' }).click()
  await page.getByRole('button', { name: 'Transition' }).click()
  await page.getByRole('menuitem', { name: 'Use “Slide in” on every slide' }).click()
  expect((await deck(page)).slides.map((s: { transition: string }) => s.transition)).toEqual(['slide', 'slide', 'slide'])
  await page.keyboard.press('ControlOrMeta+z')
  expect((await deck(page)).slides.map((s: { transition: string }) => s.transition)).toEqual(['none', 'none', 'slide'])

  // Going to slide 3 plays its transition: the arriving slide moves in while slide 2 is still shown.
  await page.getByRole('option', { name: 'Slide 2', exact: true }).click()
  await page.keyboard.press('Shift+F5')
  await expect(shown(page)).toHaveAttribute('data-shown', '1')
  const moving = await page.evaluate(
    () =>
      new Promise<{ animations: number; outgoingVisible: boolean }>((done) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
        requestAnimationFrame(() => {
          const incoming = document.querySelector<HTMLElement>('.present-layer[data-index="2"]')!
          const outgoing = document.querySelector<HTMLElement>('.present-layer[data-index="1"]')!
          done({ animations: incoming.getAnimations().length, outgoingVisible: getComputedStyle(outgoing).visibility === 'visible' })
        })
      }),
  )
  expect(moving).toEqual({ animations: 1, outgoingVisible: true })
  // After 250 ms only the new slide is left.
  await expect(page.locator('.present-layer[data-index="1"]')).toHaveCSS('visibility', 'hidden')
})

test('transitions are off when the system asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await slides(page, 2)
  await page.evaluate(() => window.__mySlides!.update((d) => void d.slides.forEach((s) => (s.transition = 'fade'))))
  await page.locator('.stage').focus()
  await page.keyboard.press('F5')
  const animations = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
        requestAnimationFrame(() => done(document.getAnimations().length))
      }),
  )
  expect(animations).toBe(0)
  await expect(shown(page)).toHaveAttribute('data-shown', '1')
})

/**
 * Time from a key press in one window until the other shows the new slide (the frame after it
 * changed). Both windows run in the same browser, so their clocks agree.
 */
async function follow(from: Page, to: Page, key: string, stage: string) {
  await to.evaluate((stage) => {
    const el = document.querySelector(stage)!
    window.__seenAt = new Promise<number>((done) => {
      const mo = new MutationObserver(() => {
        mo.disconnect()
        requestAnimationFrame(() => done(performance.timeOrigin + performance.now()))
      })
      mo.observe(el, { attributes: true, attributeFilter: ['data-shown'] })
    })
  }, stage)
  await from.evaluate(() => {
    window.__sentAt = new Promise<number>((done) =>
      window.addEventListener('keydown', () => done(performance.timeOrigin + performance.now()), { capture: true, once: true }),
    )
  })
  await from.keyboard.press(key)
  const seen = await to.evaluate(() => window.__seenAt!)
  const sent = await from.evaluate(() => window.__sentAt!)
  return seen - sent
}

test('Presenter view: the audience window follows the presenter and leads it, within 100 ms', async ({ page }, info) => {
  await open(page)
  await slides(page, 4)
  await page.getByRole('button', { name: 'More ways to present' }).click()
  const popup = page.waitForEvent('popup')
  await page.getByRole('menuitem', { name: 'Presenter view (notes on this screen)' }).click()
  const audience = await popup
  const presenter = page.getByRole('main', { name: 'Presenter view' })
  await expect(presenter).toBeVisible()
  await expect(audience.locator('.present-stage')).toHaveAttribute('data-shown', '0')
  await expect(audience.locator('.present-layer[data-index="0"]')).toContainText('Slide 1')
  await expect(audience.getByText('This window is for the audience.')).toBeVisible()
  await expect(presenter.getByText('Drag the audience window onto the projector’s screen')).toBeVisible()

  const cur = '.presenter-current .present-stage'
  const times: number[] = []
  times.push(await follow(page, audience, 'ArrowRight', '.present-stage'))
  await expect(audience.locator('.present-stage')).toHaveAttribute('data-shown', '1')
  await expect(presenter.getByRole('status').first()).toHaveText('Slide 2 of 4')
  await expect(presenter.getByRole('region', { name: 'Speaker notes' })).toContainText('Notes for slide 2')
  await expect(presenter.getByRole('region', { name: 'Next slide' }).locator('.present-layer[data-index="2"]')).toContainText('Slide 3')

  // A key pressed in the audience's window moves the presenter's too.
  times.push(await follow(audience, page, 'ArrowRight', cur))
  await expect(page.locator(cur)).toHaveAttribute('data-shown', '2')
  times.push(await follow(audience, page, 'ArrowLeft', cur))
  times.push(await follow(page, audience, 'End', '.present-stage'))
  await expect(presenter.getByRole('region', { name: 'Next slide' })).toContainText('End of presentation')

  // Blank from the presenter's buttons.
  await presenter.getByRole('button', { name: 'Blank screen' }).click()
  await expect(audience.getByRole('img', { name: 'Screen blanked' })).toBeVisible()
  await presenter.getByRole('button', { name: 'Blank screen' }).click()
  await expect(audience.getByRole('img', { name: 'Screen blanked' })).toHaveCount(0)

  info.annotations.push({ type: 'follow ms', description: times.map((t) => t.toFixed(1)).join(', ') })
  console.log('follow ms', times.map((t) => t.toFixed(1)).join(', '))
  for (const t of times) expect(t).toBeLessThan(100)
  await scan(page, 'presenter view')

  // Ending from the presenter closes the audience's window.
  const closed = audience.waitForEvent('close')
  await presenter.getByRole('button', { name: 'End presentation' }).click()
  await closed
  await expect(page.locator('.app')).toBeVisible()
  expect((await current(page)).notes).toBe('Notes for slide 4')
})

test('Presenter view: timer, clock, notes text size; closing the audience window ends it', async ({ page }) => {
  const t0 = new Date('2026-11-19T09:00:00')
  await page.clock.install({ time: t0 })
  await open(page)
  await slides(page, 2)
  await page.getByRole('button', { name: 'More ways to present' }).click()
  const popup = page.waitForEvent('popup')
  await page.getByRole('menuitem', { name: 'Presenter view (notes on this screen)' }).click()
  const audience = await popup
  const presenter = page.getByRole('main', { name: 'Presenter view' })
  await expect(audience.locator('.present-stage')).toHaveAttribute('data-shown', '0')

  // Time stands still from here on, except when the test moves it.
  await page.clock.pauseAt(new Date(t0.getTime() + 10 * 60_000))
  const elapsed = presenter.locator('.presenter-elapsed')
  await presenter.getByRole('button', { name: 'Reset timer' }).click()
  await expect(elapsed).toHaveText('0:00')
  await page.clock.runFor(65_000)
  await expect(elapsed).toHaveText('1:05')
  await presenter.getByRole('button', { name: 'Pause timer' }).click()
  await page.clock.runFor(30_000)
  await expect(elapsed).toHaveText('1:05')
  await presenter.getByRole('button', { name: 'Resume timer' }).click()
  await page.clock.runFor(5_000)
  await expect(elapsed).toHaveText('1:10')
  await presenter.getByRole('button', { name: 'Reset timer' }).click()
  await expect(elapsed).toHaveText('0:00')
  await expect(presenter.locator('.presenter-clock')).toHaveText(/\d{1,2}:\d{2}/)

  const notes = presenter.locator('.presenter-notes-text')
  await expect(notes).toHaveCSS('font-size', '20px')
  await presenter.getByRole('button', { name: 'Larger notes text' }).click()
  await expect(notes).toHaveCSS('font-size', '24px')
  await presenter.getByRole('button', { name: 'Smaller notes text' }).click()
  await presenter.getByRole('button', { name: 'Smaller notes text' }).click()
  await expect(notes).toHaveCSS('font-size', '18px')
  await expect(notes).toHaveText('No notes for this slide.')

  // Closing the audience's window ends the presentation here too.
  await audience.close()
  await expect(presenter).toHaveCount(0)
  await expect(page.locator('.app')).toBeVisible()

  // The notes size is remembered on this device.
  await page.getByRole('button', { name: 'More ways to present' }).click()
  const again = page.waitForEvent('popup')
  await page.getByRole('menuitem', { name: 'Presenter view (notes on this screen)' }).click()
  await again
  await expect(page.locator('.presenter-notes-text')).toHaveCSS('font-size', '18px')
  await page.keyboard.press('Escape')
  await expect(page.locator('.presenter')).toHaveCount(0)
})

test('Presenter view: closing the presenter’s window closes the audience’s', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'More ways to present' }).click()
  const popup = page.waitForEvent('popup')
  await page.getByRole('menuitem', { name: 'Presenter view (notes on this screen)' }).click()
  const audience = await popup
  await expect(audience.locator('.present-stage')).toHaveAttribute('data-shown', '0')
  const closed = audience.waitForEvent('close')
  await page.close({ runBeforeUnload: false })
  await closed
})

test('Presenter view: a blocked pop-up says what to do', async ({ page }) => {
  await open(page)
  await page.evaluate(() => (window.open = () => null))
  await page.getByRole('button', { name: 'More ways to present' }).click()
  await page.getByRole('menuitem', { name: 'Presenter view (notes on this screen)' }).click()
  const dialog = page.getByRole('dialog', { name: 'The audience window was blocked' })
  await expect(dialog).toContainText('Allow pop-ups for this page')
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(page.locator('.presenter')).toHaveCount(0)
})
