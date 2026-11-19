import { expect, test } from '@playwright/test'
import { open } from './helpers'

// Spec, Reliability: if storage runs low, say so and keep working.

test('backups that fail for lack of space are reported in plain words, and the warning clears when they work again', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if ((window as unknown as { __full?: boolean }).__full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await open(page)
  await page.evaluate(() => ((window as unknown as { __full: boolean }).__full = true))
  await page.keyboard.type('Rivers')
  const warning = page.getByRole('alert')
  await expect(warning).toContainText('Not backed up: this device is out of space', { timeout: 5000 })
  await expect(warning).toContainText('save it to a file')
  // Still working: typing goes on.
  await page.keyboard.type(' of Europe')
  await expect(page.locator('.el-live')).toContainText('Rivers of Europe')

  await page.evaluate(() => ((window as unknown as { __full: boolean }).__full = false))
  await page.keyboard.type('!')
  await expect(warning).toHaveCount(0, { timeout: 5000 })
})

test('nearly full storage is reported before backups fail', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: async () => ({ usage: 990e6, quota: 1000e6 }), persisted: async () => true, persist: async () => true },
    })
  })
  await open(page)
  await page.keyboard.type('Deserts')
  await expect(page.getByRole('alert')).toContainText('almost out of space for backups', { timeout: 5000 })
})
