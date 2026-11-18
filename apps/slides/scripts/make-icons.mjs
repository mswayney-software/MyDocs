// Renders the app icons from inline SVG with Playwright's Chromium (a dev dependency),
// so no image library is needed. Run: node scripts/make-icons.mjs
import { chromium } from '@playwright/test'

// The slide icon from favicon.svg, drawn on a colored tile. "maskable" keeps the art inside
// the 80% safe zone so Android and ChromeOS can crop it to any shape.
const tile = (size, maskable) => {
  const pad = maskable ? 0.22 : 0.14
  const art = size * (1 - pad * 2)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.2}" fill="#1f6f7a"/>
  <g transform="translate(${size * pad} ${size * pad}) scale(${art / 32})">
    <rect x="3" y="7" width="26" height="16" rx="1.5" fill="#fff" stroke="#0e3a40" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M16 23v4M11 27h10" fill="none" stroke="#0e3a40" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M8 12h12M8 16h7" fill="none" stroke="#1f6f7a" stroke-width="2" stroke-linecap="round"/>
  </g></svg>`
}

const icons = [
  ['public/pwa-192.png', 192, false],
  ['public/pwa-512.png', 512, false],
  ['public/pwa-maskable-512.png', 512, true],
  ['public/apple-touch-icon.png', 180, false],
]
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [path, size, maskable] of icons) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${tile(size, maskable)}`)
  await page.locator('svg').screenshot({ path, omitBackground: true })
  console.log('wrote', path)
}
await browser.close()
