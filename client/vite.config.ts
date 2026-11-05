import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
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
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'SyncPadIO - Direct P2P & Ephemeral Sharing',
        short_name: 'SyncPadIO',
        description: 'Zero-knowledge real-time code, notes, and direct WebRTC P2P stream sharing',
        theme_color: '#0b0d13',
        background_color: '#0b0d13',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        categories: ['productivity', 'utilities', 'developer tools'],
        shortcuts: [
          {
            name: 'Create Instant Session',
            short_name: 'New Room',
            description: 'Generate an instant encrypted ephemeral room',
            url: '/',
            icons: [{ src: 'icon.svg', sizes: 'any' }]
          },
          {
            name: 'Direct P2P Stream',
            short_name: 'P2P Transfer',
            description: 'Direct browser-to-browser infinite file streaming',
            url: '/?tab=p2p',
            icons: [{ src: 'icon.svg', sizes: 'any' }]
          }
        ],
        share_target: {
          action: '/?share-target=true',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: {
            title: 'title',
            text: 'text',
            url: 'url'
          }
        },
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['lucide-react', 'qrcode.react'],
          'syntax-highlighter': ['react-syntax-highlighter'],
          'markdown': ['react-markdown', 'remark-gfm'],
          'supabase': ['@supabase/supabase-js']
        }
      }
    }
  }
})
