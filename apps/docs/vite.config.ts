/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { contentSecurityPolicy, offlineWorkbox } from '@mysuite/core/vite'

/**
 * Where the app is served from. "/" locally and in tests; GitHub Pages serves it from
 * "/MyDocs/" (set by .github/workflows/pages.yml).
 */
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
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
        // Installed app opens .owdoc files from the file manager (Chrome and Edge).
        file_handlers: [
          { action: base, accept: { 'application/vnd.mydocs+json': ['.owdoc'] } },
        ],
      },
      workbox: offlineWorkbox(base),
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
