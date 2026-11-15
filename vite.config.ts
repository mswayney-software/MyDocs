/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Production builds carry a Content-Security-Policy: the browser itself refuses any request to
 * another server (images, fonts, scripts, fetches). "Zero network requests" is enforced, not
 * just promised. Dev builds skip it, since the dev server injects inline scripts.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Inline style attributes carry document formatting (alignment, indents, colors).
  "style-src 'self' 'unsafe-inline'",
  // Images live inside documents as data URLs.
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

const contentSecurityPolicy: Plugin = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
}

export default defineConfig({
  plugins: [
    react(),
    contentSecurityPolicy,
    VitePWA({
      // A new version waits until the student chooses to restart; never reload mid-sentence.
      registerType: 'prompt',
      injectRegister: false, // registered from src/offline.ts
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MyDocs',
        short_name: 'MyDocs',
        description: 'A free word processor for school papers that works offline. Your files stay on your device.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#e9e9e6',
        theme_color: '#f7f7f5',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Installed app opens .owdoc files from the file manager (Chrome and Edge).
        file_handlers: [
          { action: '/', accept: { 'application/vnd.mydocs+json': ['.owdoc'] } },
        ],
      },
      workbox: {
        // Everything the app needs, fonts included: after the first load nothing comes from the network.
        // Only woff2 fonts: every supported browser uses them, the .woff fallbacks are never requested.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // The editor bundle is over Workbox's 2 MB default for a single file.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // No runtime caching rules: the app makes no runtime requests.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
