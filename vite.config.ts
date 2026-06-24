import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Offline support. The app's data is already offline-first (static JSON
    // bundled into the app), but without a service worker the *shell*
    // (HTML/JS/CSS) still had to be fetched from the network on every load,
    // so the app couldn't even start offline. This precaches the shell so the
    // app boots with no connection; local games then play fully offline and
    // AI-backed features (which call /api/ai) simply fail gracefully.
    VitePWA({
      // autoUpdate = new builds activate and reload automatically, so users
      // never get stuck on a stale cached version (the classic SW trap).
      registerType: 'autoUpdate',
      // Auto-inject the registration script — no change needed in main.tsx.
      injectRegister: 'auto',
      // We already ship a hand-authored public/manifest.json (linked from
      // index.html). Don't let the plugin generate a second one.
      manifest: false,
      workbox: {
        // Precache the built shell + the lazy jumble_sets chunk + splash bg.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,woff2}'],
        // Main bundle is ~840KB; lift the cap above Workbox's 2MB default
        // so the whole shell precaches cleanly.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // SPA: serve index.html for navigations when offline...
        navigateFallback: 'index.html',
        // ...but never hijack API calls with the HTML fallback.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Never serve a stale AI response; offline AI just fails.
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
          {
            // Google Fonts stylesheet — keep typography fresh but offline-able.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // Google Fonts files — immutable, cache hard for a year.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Keep the SW out of `npm run dev` to avoid local caching headaches.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true
  }
})
