/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // A new version waits until the student chooses to restart; never reload mid-sentence.
      registerType: 'prompt',
      injectRegister: false, // registered from src/offline.ts
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Open Writer',
        short_name: 'Open Writer',
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
          { action: '/', accept: { 'application/vnd.open-writer+json': ['.owdoc'] } },
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
