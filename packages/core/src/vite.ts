import type { Plugin } from 'vite'

/**
 * Build settings both apps share. Imported by each app's vite.config.ts (runs in Node).
 *
 * Production builds carry a Content-Security-Policy: the browser itself refuses any request to
 * another server (images, fonts, scripts, fetches). "Zero network requests" is enforced, not
 * just promised. Dev builds skip it, since the dev server injects inline scripts.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Inline style attributes carry document formatting (alignment, indents, colors) and slide positions.
  "style-src 'self' 'unsafe-inline'",
  // Images live inside documents as data URLs, and inside decks as blobs.
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

export const contentSecurityPolicy: Plugin = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
}

/**
 * Service worker settings: cache everything on first load, never fetch at runtime.
 * `otherApps` are paths under `base` that belong to another app with its own service worker
 * (MySlides at /MyDocs/slides/): this app must not answer their page loads with its own page.
 */
export function offlineWorkbox(base: string, otherApps: string[] = []) {
  return {
    // Everything the app needs, fonts included: after the first load nothing comes from the network.
    // Only woff2 fonts: every supported browser uses them, the .woff fallbacks are never requested.
    globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
    // The editor bundle is over Workbox's 2 MB default for a single file.
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    navigateFallback: `${base}index.html`,
    navigateFallbackDenylist: otherApps.map((path) => new RegExp(`^${escapeRegExp(base + path)}`)),
    cleanupOutdatedCaches: true,
    // No runtime caching rules: the app makes no runtime requests.
    runtimeCaching: [],
  }
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
