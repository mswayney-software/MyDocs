import { expect, test, type Request } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

test('boots to an empty deck shell with no requests to other sites', async ({ page, baseURL }) => {
  const external: string[] = []
  page.on('request', (req) => {
    if (!req.url().startsWith(baseURL!) && !req.url().startsWith('data:')) external.push(req.url())
  })
  await page.goto('/')
  await expect(page).toHaveTitle('Untitled deck - MySlides')
  await expect(page.getByRole('heading', { name: 'Untitled deck' })).toBeVisible()
  await expect(page.getByRole('main', { name: 'Slide editor' })).toBeVisible()
  expect(external).toEqual([])
})

test('installs as its own app, separate from MyDocs', async ({ page }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const manifest = await (await page.request.get(href!)).json()
  expect(manifest).toMatchObject({
    name: 'MySlides',
    short_name: 'MySlides',
    id: '/?app=myslides',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  })
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ''}`)
  expect(sizes).toEqual(['192x192', '512x512', '512x512 maskable'])
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true)
})

test('production build carries the no-network content security policy', async ({ page }) => {
  await page.goto('/')
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("connect-src 'self'")
})

test('after the first load, it starts with the network off and makes zero network requests', async ({ page, context, browserName }) => {
  // First visit, online: the service worker installs and caches everything.
  await page.goto('/')
  await expect(page.getByText('Works offline')).toBeVisible({ timeout: 20_000 })

  await context.setOffline(true)
  const failed: string[] = []
  const network: string[] = []
  page.on('requestfailed', (r: Request) => failed.push(`${r.url()} (${r.failure()?.errorText})`))
  page.on('response', (r) => {
    // Chromium reports which responses came from the service worker; Firefox always says false,
    // so there the offline network itself is the check: anything that reached it fails.
    if (r.request().serviceWorker() === null && !r.fromServiceWorker() && !r.url().startsWith('data:')) {
      network.push(r.url())
    }
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Untitled deck' })).toBeVisible()
  await expect(page.getByText('Works offline')).toBeVisible()

  // Every bundled font style comes from the cache.
  const fonts = await page.evaluate(async () => {
    const out: Record<string, boolean> = {}
    for (const family of ['Tinos', 'Arimo', 'Carlito']) {
      for (const style of ['', 'bold ', 'italic ', 'bold italic ']) {
        const faces = await document.fonts.load(`${style}24pt "${family}"`, 'Aé€ω')
        out[`${style}${family}`] = faces.length > 0 && faces.every((f) => f.status === 'loaded')
      }
    }
    return out
  })
  expect(Object.values(fonts).every(Boolean), JSON.stringify(fonts)).toBe(true)

  expect(failed, 'requests that tried the network').toEqual([])
  if (browserName === 'chromium') expect(network, 'responses not from the service worker').toEqual([])
})

test('first download of the app is under 2 MB compressed, fonts not counted', async ({ browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Reads the build once')
  // Everything the service worker caches on the first visit, compressed as a web server would.
  const root = join(import.meta.dirname, '..', 'dist-e2e')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) walk(join(dir, f.name))
      else files.push(join(dir, f.name))
    }
  }
  walk(root)
  const app = files.filter((f) => /\.(js|css|html|svg|png|webmanifest|md)$/.test(f) && !/print-test\.html$/.test(f))
  const fonts = files.filter((f) => f.endsWith('.woff2'))
  const gz = (f: string) => gzipSync(readFileSync(f), { level: 9 }).length
  const appBytes = app.reduce((sum, f) => sum + gz(f), 0)
  const fontBytes = fonts.reduce((sum, f) => sum + statSync(f).size, 0)
  const report = { appKB: Math.round(appBytes / 1024), fontsKB: Math.round(fontBytes / 1024), files: app.length }
  info.annotations.push({ type: 'first download', description: JSON.stringify(report) })
  console.log('first download', JSON.stringify(report))
  expect(appBytes).toBeLessThan(2 * 1024 * 1024)
})
