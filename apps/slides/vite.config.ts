/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { contentSecurityPolicy, offlineWorkbox } from '@mysuite/core/vite'

/**
 * THIRD_PARTY_LICENSES.md (written by `npm run licenses`: every package MySlides ships, with its
 * license text) goes into the build, next to index.html, and into the offline cache.
 */
const LICENSES = 'THIRD_PARTY_LICENSES.md'
const shipLicenses: Plugin = {
  name: 'myslides-licenses',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: LICENSES, source: readFileSync(new URL(LICENSES, import.meta.url), 'utf8') })
  },
}

/** Where the app is served from. "/" locally and in tests. */
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    contentSecurityPolicy,
    shipLicenses,
    VitePWA({
      // A new version waits until the student chooses to restart; never reload mid-presentation.
      registerType: 'prompt',
      injectRegister: false, // registered from @mysuite/core/offline
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        // Its own app, installed separately from MyDocs.
        id: `${base}?app=myslides`,
        name: 'MySlides',
        short_name: 'MySlides',
        description: 'A free presentation app for school that works offline. Your files stay on your device.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#e9e9e6',
        theme_color: '#f7f7f5',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Installed app opens deck files from the file manager (Chrome and Edge). Extension is a placeholder.
        file_handlers: [{ action: base, accept: { 'application/vnd.myslides+zip': ['.myslides'] } }],
      },
      workbox: { ...offlineWorkbox(base), globPatterns: [...offlineWorkbox(base).globPatterns, LICENSES] },
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
