import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH lets the same app be served from a sub-folder (e.g. GitHub Pages).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Care.ai — Patient',
        short_name: 'Care.ai',
        description: 'AI-powered skin recovery monitoring',
        theme_color: '#0a0a12',
        background_color: '#0a0a12',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Never precache HTML — hashed JS/CSS are safe to cache forever, but
        // index.html must always come from the network so new chunk names are found.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        cacheId: 'care-ai-v4',
        runtimeCaching: [
          {
            // Navigation (index.html): always network-first so new JS chunk hashes
            // are always referenced, preventing the blank-screen-on-redeploy problem.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'navigation-cache', networkTimeoutSeconds: 5 },
          },
          {
            // Only cache Supabase Storage (GET photo URLs) — not Auth/RPC/Functions
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-storage-cache', expiration: { maxEntries: 50, maxAgeSeconds: 3600 } }
          }
        ]
      },
      devOptions: {
        enabled: false,
      }
    })
  ],
  server: {
    host: true,   // exposes on local network so your phone can reach it
    port: 5174,
    allowedHosts: true,
  },
  resolve: {
    alias: { '@': '/src' }
  }
});
