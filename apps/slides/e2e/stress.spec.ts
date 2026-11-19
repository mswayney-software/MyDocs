import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildStressDeck, STRESS } from '../scripts/stress-deck'
import { deck, open } from './helpers'

// The stress deck (spec, Performance budgets), built by the script in scripts/stress-deck.ts.
// Timings here are from the development PC, not the 4 GB target laptop; the slowed-down run
// (Chrome's CPU throttling, 4x) is a stand-in, not a substitute.

// One at a time: these tests time frames, and two of them side by side would slow each other.
test.describe.configure({ mode: 'default' })

let stressFile = ''
test.beforeAll(async () => {
  stressFile = join(mkdtempSync(join(tmpdir(), 'myslides-stress-')), 'Stress deck.myslides')
  writeFileSync(stressFile, await buildStressDeck())
})

async function openStress(page: Page) {
  await open(page)
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+o')
  await (await chooser).setFiles(stressFile)
  await expect(page.locator('.file-name')).toHaveText('Stress deck', { timeout: 20_000 })
}

/**
 * Scroll a list from top to bottom and back at a steady speed, one step per frame, as a fast
 * mouse wheel would, and time every frame.
 */
function scrollFrames(page: Page, selector: string, pxPerFrame: number) {
  return page.evaluate(
    ({ selector, pxPerFrame }) =>
      new Promise<number[]>((done) => {
        const el = document.querySelector<HTMLElement>(selector)!
        const max = el.scrollHeight - el.clientHeight
        const frames: number[] = []
        let dir = 1
        let last = performance.now()
        const step = (now: number) => {
          frames.push(now - last)
          last = now
          el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + dir * pxPerFrame))
          if (dir === 1 && el.scrollTop >= max) dir = -1
          else if (dir === -1 && el.scrollTop <= 0) return done(frames.slice(1))
          requestAnimationFrame(step)
        }
        requestAnimationFrame((t) => {
          last = t
          requestAnimationFrame(step)
        })
      }),
    { selector, pxPerFrame },
  )
}

const summary = (frames: number[]) => {
  const sorted = [...frames].sort((a, b) => a - b)
  const total = frames.reduce((a, b) => a + b, 0)
  return {
    frames: frames.length,
    fps: Math.round((frames.length / total) * 1000),
    p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
    worst: Math.round(sorted.at(-1)!),
    over50: frames.filter((f) => f > 50).length,
  }
}

test.describe('stress deck', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Frame timing and CPU throttling: measured in Chrome')
  test.setTimeout(120_000)

  test('opens complete, and the sorter and strip scroll smoothly through all 60 slides', async ({ page }, info) => {
    const started = Date.now()
    await openStress(page)
    await expect(page.locator('.stage .el-text').first()).toBeVisible()
    const openMs = Date.now() - started
    const d = await deck(page)
    const count = (type: string) => d.slides.flatMap((s: { elements: { type: string }[] }) => s.elements).filter((e: { type: string }) => e.type === type).length
    expect(d.slides).toHaveLength(STRESS.slides)
    expect([count('image'), count('table'), count('chart')]).toEqual([STRESS.pictures, STRESS.tables, STRESS.charts])

    // The strip draws only what is on screen.
    expect(await page.locator('.grid-strip .slide-surface').count()).toBeLessThan(20)
    const strip = summary(await scrollFrames(page, '.grid-strip', 40))

    await page.getByRole('button', { name: 'Slide sorter' }).click()
    await expect(page.getByRole('listbox', { name: 'All slides' })).toBeVisible()
    expect(await page.locator('.grid-sorter .slide-surface').count()).toBeLessThan(40)
    const sorter = summary(await scrollFrames(page, '.grid-sorter', 40))

    // Slowed down four times, as a stand-in for a low-end laptop.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const sorterSlow = summary(await scrollFrames(page, '.grid-sorter', 40))
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

    const report = { openMs, strip, sorter, sorterSlow4x: sorterSlow }
    info.annotations.push({ type: 'stress timings', description: JSON.stringify(report) })
    console.log('stress timings', JSON.stringify(report))
    // Smooth: 30 frames a second or better on average, no frame much over a tenth of a second.
    // The slowed-down run goes in the report only: with other tests running on the same machine
    // it measures the machine as much as the app.
    for (const r of [strip, sorter]) {
      expect(r.fps).toBeGreaterThanOrEqual(30)
      expect(r.p95).toBeLessThanOrEqual(50)
    }
  })

  test('reorders in the sorter by drag and keyboard, and undo restores the order', async ({ page }) => {
    await openStress(page)
    const ids = async () => (await deck(page)).slides.map((s: { id: string }) => s.id).join(' ')
    const before = await ids()
    await page.getByRole('button', { name: 'Slide sorter' }).click()
    const grid = page.getByRole('listbox', { name: 'All slides' })
    const thumb = (n: number) => grid.getByRole('option', { name: `Slide ${n}`, exact: true })

    // Drag slide 3 in front of slide 1.
    const three = (await thumb(3).boundingBox())!
    const one = (await thumb(1).boundingBox())!
    await page.mouse.move(three.x + three.width / 2, three.y + three.height / 2)
    await page.mouse.down()
    await page.mouse.move(three.x + 20, three.y + 20, { steps: 3 })
    await page.mouse.move(one.x + 4, one.y + one.height / 2, { steps: 6 })
    await page.mouse.up()
    expect((await deck(page)).slides[0].id).toBe('s3')

    // Keyboard: Ctrl+End sends it to the back, Ctrl+Up moves it up a row.
    await expect(thumb(1)).toBeFocused()
    await page.keyboard.press('ControlOrMeta+End')
    expect((await deck(page)).slides.at(-1).id).toBe('s3')
    await page.keyboard.press('ControlOrMeta+ArrowUp')
    const cols = await page.evaluate(() => {
      const xs = [...document.querySelectorAll('.grid-sorter .grid-cell')].map((c) => c.getBoundingClientRect().top)
      return xs.filter((t) => t === xs[0]).length
    })
    expect((await deck(page)).slides.findIndex((s: { id: string }) => s.id === 's3')).toBe(59 - cols)

    for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+z')
    expect(await ids()).toBe(before)
  })
})

// Present (spec, Phase 5): the whole stress deck with the network off, in every browser.
test.describe('stress deck, presenting', () => {
  test.setTimeout(120_000)
  test('presents start to finish with the network off, each next slide under 100 ms', async ({ page, context, browserName }, info) => {
    // As on a student's laptop after the first visit: the app and its fonts come from the
    // service worker's cache. The deck then opens in a fresh page, no picture decoded yet.
    await open(page)
    await expect(page.getByText('Works offline')).toBeVisible({ timeout: 20_000 })
    await openStress(page)
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    const failed: string[] = []
    page.on('requestfailed', (r) => failed.push(r.url()))
    await context.setOffline(true)
  
    /** Present the whole deck with the arrow key; time each move to the frame that shows it. */
    const run = async () => {
      await page.getByRole('button', { name: 'Present', exact: true }).click()
      await expect(page.locator('.present-stage')).toHaveAttribute('data-shown', '0')
      const times: number[] = []
      for (let i = 1; i <= STRESS.slides; i++) {
        await page.evaluate(() => {
          const el = document.querySelector('.present-stage')!
          window.__sentAt = new Promise<number>((done) =>
            window.addEventListener('keydown', (e) => done(e.timeStamp), { capture: true, once: true }),
          )
          window.__seenAt = new Promise<number>((done) => {
            const mo = new MutationObserver(() => {
              mo.disconnect()
              requestAnimationFrame(() => done(performance.now()))
            })
            mo.observe(el, { attributes: true, attributeFilter: ['data-shown'] })
          })
        })
        await page.keyboard.press('ArrowRight')
        const ms = await page.evaluate(async () => (await window.__seenAt!) - (await window.__sentAt!))
        times.push(ms)
        await expect(page.locator('.present-stage')).toHaveAttribute('data-shown', i === STRESS.slides ? 'end' : String(i))
        // Pictures on the slide are drawn, not still loading.
        if (i < STRESS.slides) {
          const undrawn = await page.evaluate((i) => [...document.querySelectorAll<HTMLImageElement>(`.present-layer[data-index="${i}"] img`)].filter((img) => !img.complete || !img.naturalWidth).length, i)
          expect(undrawn, `slide ${i + 1} pictures`).toBe(0)
        }
      }
      await page.keyboard.press('Escape')
      await expect(page.locator('.present')).toHaveCount(0)
      return times
    }
    const summary = (t: number[]) => ({ worst: Math.round(Math.max(...t)), median: Math.round([...t].sort((a, b) => a - b)[Math.floor(t.length / 2)]) })
    const normal = await run()
    // Chrome can slow its processor four times, as a stand-in for a low-end laptop.
    let slow: number[] | null = null
    if (browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      slow = await run()
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    }
    await context.setOffline(false)
  
    const report = { normal: summary(normal), slow4x: slow && summary(slow) }
    info.annotations.push({ type: 'next slide ms', description: JSON.stringify(report) })
    console.log('next slide ms', JSON.stringify(report))
    expect(failed, 'requests made with the network off').toEqual([])
    expect(Math.max(...normal)).toBeLessThan(100)
    // Slowed down, the figure goes in the report only: with other tests running on the same
    // machine it measures the machine as much as the app.
  })
})
