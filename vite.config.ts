import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The app ships its own public/manifest.json, already linked from index.html.
      // manifest: false stops the plugin from generating (and injecting a link to)
      // a second manifest.webmanifest that would conflict with it.
      manifest: false,
      workbox: {
        // Precache every built asset — all lazy game/data JS chunks, CSS, icons,
        // splash-bg.jpg and manifest.json — so every game works fully offline
        // after the first load.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,json}'],
        // _source/ is raw icon master art copied from public/ — never fetched at runtime.
        globIgnores: ['**/node_modules/**', '_source/**'],
        navigateFallback: '/index.html',
        // /api/* are serverless functions (AI calls) — never serve the SPA shell
        // for them, and never cache them (app has offline fallbacks in code).
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true
  }
})
