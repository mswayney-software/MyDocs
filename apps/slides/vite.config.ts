/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { contentSecurityPolicy, offlineWorkbox } from '@mysuite/core/vite'

/** Where the app is served from. "/" locally and in tests. */
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    contentSecurityPolicy,
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
        // The deck file handler is added in Phase 1 with the file format (extension still a placeholder).
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
