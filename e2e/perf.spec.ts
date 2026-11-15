import { expect, test, type Page } from '@playwright/test'
import { fiftyPages } from './fifty-pages'

/**
 * Typing stays responsive in a 50-page document on a slow machine. The CPU is slowed 4x
 * (roughly a 4 GB Chromebook) and every keystroke's time from key press to the next paint
 * is read from the browser's own Event Timing data.
 */

const doc = (page: Page) => page.getByRole('textbox', { name: 'Document' })

test('typing stays responsive in a 50-page document on a slow machine', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Event Timing and CPU throttling are Chromium features')
  test.setTimeout(180_000)
  await page.goto('/')
  await expect(doc(page)).toBeFocused()

  const words = await fiftyPages(page)
  expect(words).toBeGreaterThan(25_000) // about 50 pages at 500 words a page

  // Type in the middle of the document, where every change touches the most around it.
  await page.evaluate(() => {
    const ed = window.__openWriter!
    let target = 0
    let count = 0
    ed.state.doc.descendants((n, pos) => {
      if (n.type.name === 'paragraph' && ++count === 120) target = pos + 5
      return target === 0
    })
    ed.chain().focus().setTextSelection(target).scrollIntoView().run()
  })
  await page.waitForTimeout(1500) // let the backup and word count settle

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.evaluate(() => {
    // One keystroke fires several events (keydown, beforeinput, input, keyup); they share an
    // interaction id, and the slowest of them is how long that keystroke took.
    const w = window as unknown as { __byKey: Record<number, number> }
    w.__byKey = {}
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEventTiming & { interactionId?: number })[]) {
        if (!e.interactionId) continue
        w.__byKey[e.interactionId] = Math.max(w.__byKey[e.interactionId] ?? 0, e.duration)
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit)
  })

  // A student typing at a brisk 8 to 9 keys a second, including spaces and a few Enters.
  const sentence = 'The reformers wrote letters to the newspapers every week. '
  for (let round = 0; round < 3; round++) {
    await page.keyboard.type(sentence, { delay: 110 })
    await page.keyboard.press('Enter', { delay: 110 })
  }
  await page.keyboard.press('Backspace', { delay: 110 })
  await page.waitForTimeout(1500)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

  // Event Timing only reports events slower than 16 ms; everything else was faster.
  const slow = await page.evaluate(() => Object.values((window as unknown as { __byKey: Record<number, number> }).__byKey))
  const keys = sentence.length * 3 + 4
  const sorted = [...slow].sort((a, b) => a - b)
  const pct = (p: number) => {
    const fast = keys - sorted.length // keys under 16 ms
    const rank = Math.ceil((p / 100) * keys)
    return rank <= fast ? 16 : sorted[rank - fast - 1]
  }
  const report = { keys, slowerThan16ms: sorted.length, p50: pct(50), p95: pct(95), worst: sorted.at(-1) ?? 0 }
  test.info().annotations.push({ type: 'typing latency at 4x CPU slowdown (ms)', description: JSON.stringify(report) })
  console.log('typing latency (ms, 4x slower CPU):', JSON.stringify(report))

  // Under 50 ms feels instant; under 100 ms is the usual limit for "responsive".
  expect(report.p95, 'p95 key-to-paint time').toBeLessThan(50)
  expect(report.worst, 'slowest keystroke').toBeLessThan(100)

  // Nothing typed was lost.
  const text = await page.evaluate(() => window.__openWriter!.state.doc.textContent)
  expect(text).toContain('The reformers wrote letters to the newspapers every week.')
})
