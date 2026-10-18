import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/interpret/',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '口译随手练',
        short_name: '随手练',
        description: '随时来一句，保持翻译敏感度',
        theme_color: '#1c1c1f',
        background_color: '#1c1c1f',
        display: 'standalone',
        start_url: '/interpret/',
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json,woff2}'],
        runtimeCaching: [{
          urlPattern: /audio\/.+\.(mp3)$/,
          handler: 'CacheFirst',
          options: { cacheName: 'audio-v1', expiration: { maxEntries: 800, purgeOnQuotaError: true } }
        }]
      }
    })
  ],
  test: {
    environment: 'happy-dom',
    globals: false
  }
})
