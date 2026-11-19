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
// eslint-disable-next-line no-empty-pattern -- Playwright needs the fixtures argument before testInfo
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000) // building the deck takes a few seconds, longer on a busy machine
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

// The rest of the performance budget (spec, Performance budgets), on the stress deck, in Chrome.
// Development PC figures; the 4 GB target laptop is a manual check (README, "Needs a person").
test.describe('stress deck, the other budgets', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Timed with Chrome tools')
  test.setTimeout(180_000)

  /** Record every frame's length from now until stopFrames(). */
  const recordFrames = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __recording: boolean }
      w.__frames = []
      w.__recording = true
      let last = performance.now()
      const tick = (now: number) => {
        w.__frames.push(now - last)
        last = now
        if (w.__recording) requestAnimationFrame(tick)
      }
      requestAnimationFrame((t) => {
        last = t
        requestAnimationFrame(tick)
      })
    })
  const stopFrames = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __recording: boolean }
      w.__recording = false
      return w.__frames.slice(1)
    })

  test('typing has no visible lag, dragging stays smooth, switching slides is under 150 ms', async ({ page }, info) => {
    await openStress(page)
    const d = await deck(page)
    const report: Record<string, unknown> = {}

    // ---- Switching slides: Page Down through every slide, key press to the frame showing it.
    await page.locator('.stage').focus()
    const switches: number[] = []
    for (let i = 1; i < STRESS.slides; i++) {
      await page.evaluate(() => {
        const stage = document.querySelector('.stage')!
        const w = window as unknown as { __sentAt: Promise<number>; __seenAt: Promise<number> }
        w.__sentAt = new Promise((done) => window.addEventListener('keydown', (e) => done(e.timeStamp), { capture: true, once: true }))
        w.__seenAt = new Promise((done) => {
          const mo = new MutationObserver(() => {
            mo.disconnect()
            requestAnimationFrame(() => done(performance.now()))
          })
          mo.observe(stage, { attributes: true, attributeFilter: ['data-slide'] })
        })
      })
      await page.keyboard.press('PageDown')
      switches.push(
        await page.evaluate(async () => {
          const w = window as unknown as { __sentAt: Promise<number>; __seenAt: Promise<number> }
          return (await w.__seenAt) - (await w.__sentAt)
        }),
      )
    }
    const sorted = [...switches].sort((a, b) => a - b)
    report.switchSlideMs = { worst: Math.round(sorted.at(-1)!), median: Math.round(sorted[sorted.length >> 1]) }
    expect(sorted.at(-1)!, 'slowest slide switch (ms)').toBeLessThan(150)

    // ---- Dragging: a picture across its slide, one small step after another, frames timed.
    const pictureSlide = d.slides.findIndex((s: { elements: { type: string }[] }) => s.elements.some((e) => e.type === 'image'))
    // The strip draws only the thumbnails near the screen, so go to the slide directly.
    await page.evaluate((i) => window.__mySlides!.goTo(window.__mySlides!.getState().deck.slides[i].id), pictureSlide)
    const pic = page.locator('.stage img.el-image').first()
    const b = (await pic.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await recordFrames(page)
    for (let i = 1; i <= 60; i++) await page.mouse.move(b.x + b.width / 2 - i * 4, b.y + b.height / 2 + Math.sin(i / 6) * 40)
    const drag = summary(await stopFrames(page))
    await page.mouse.up()
    await page.keyboard.press('ControlOrMeta+z')
    report.drag = drag
    expect(drag.fps, 'frames a second while dragging').toBeGreaterThanOrEqual(30)

    // ---- Typing: in a text slide's body, at a student's pace, every key timed (Event Timing).
    const textSlide = d.slides.findIndex(
      (s: { elements: { type: string; role?: string }[] }, i: number) =>
        i > 0 && s.elements.some((e) => e.role === 'body') && !s.elements.some((e) => ['image', 'table', 'chart'].includes(e.type)),
    )
    const bodyId = d.slides[textSlide].elements.find((e: { role?: string }) => e.role === 'body').id
    await page.evaluate((i) => window.__mySlides!.goTo(window.__mySlides!.getState().deck.slides[i].id), textSlide)
    const body = page.locator(`.stage [data-id="${bodyId}"]`)
    await body.click()
    await body.click()
    await expect(page.locator('.el-live .ProseMirror')).toBeFocused()
    await page.keyboard.press('ControlOrMeta+End')
    const typing = async () => {
      await page.evaluate(() => {
        const w = window as unknown as { __byKey: Record<number, number> }
        w.__byKey = {}
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEventTiming & { interactionId?: number })[]) {
            if (e.interactionId) w.__byKey[e.interactionId] = Math.max(w.__byKey[e.interactionId] ?? 0, e.duration)
          }
        }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit)
      })
      const sentence = ' Plants turn light into sugar, and the sugar feeds everything else.'
      await page.keyboard.type(sentence, { delay: 110 })
      await page.waitForTimeout(1000)
      const slow = (await page.evaluate(() => Object.values((window as unknown as { __byKey: Record<number, number> }).__byKey))).sort((a, b) => a - b)
      const keys = sentence.length
      // Event Timing reports only keys slower than 16 ms; the rest were faster.
      const pct = (p: number) => {
        const fast = keys - slow.length
        const rank = Math.ceil((p / 100) * keys)
        return rank <= fast ? 16 : slow[rank - fast - 1]
      }
      return { keys, over16ms: slow.length, p95: pct(95), worst: slow.at(-1) ?? 0 }
    }
    report.typing = await typing()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    report.typingSlow4x = await typing()
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    // No visible lag: 95 keys in 100 show within 50 ms (three frames).
    expect((report.typing as { p95: number }).p95, 'typing, 95th percentile (ms)').toBeLessThanOrEqual(50)

    info.annotations.push({ type: 'budgets', description: JSON.stringify(report) })
    console.log('budgets', JSON.stringify(report))
  })

  test('memory with the stress deck open, after visiting every slide, the sorter and presenting', async ({ page }, info) => {
    await openStress(page)
    await page.locator('.stage').focus()
    for (let i = 1; i < STRESS.slides; i++) await page.keyboard.press('PageDown')
    await page.getByRole('button', { name: 'Slide sorter' }).click()
    await scrollFrames(page, '.grid-sorter', 60)
    await page.keyboard.press('Escape')
    await page.locator('.stage').focus()
    await page.keyboard.press('F5')
    for (let i = 0; i < STRESS.slides; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Escape')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('HeapProfiler.collectGarbage')
    await cdp.send('Performance.enable')
    const { metrics } = await cdp.send('Performance.getMetrics')
    const m = Object.fromEntries(metrics.map((x: { name: string; value: number }) => [x.name, x.value]))
    // Pictures decoded for what is on screen now (each at its stored size, 4 bytes a pixel): the
    // largest part of a deck's memory that the script heap doesn't show.
    const pictures = await page.evaluate(() =>
      [...document.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().width > 0).reduce((sum, i) => sum + i.naturalWidth * i.naturalHeight * 4, 0),
    )
    const mb = (n: number) => Math.round(n / 1e6)
    const report = { jsHeapMB: mb(m.JSHeapUsedSize), domNodes: m.Nodes, picturesOnScreenMB: mb(pictures) }
    info.annotations.push({ type: 'memory', description: JSON.stringify(report) })
    console.log('memory', JSON.stringify(report))
    // The tab's whole memory (the browser's task manager) is the 4 GB laptop check; these are its
    // two largest parts and must leave room under 500 MB.
    expect(report.jsHeapMB + report.picturesOnScreenMB).toBeLessThan(500)
  })
})
