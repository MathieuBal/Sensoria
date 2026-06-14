import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Sensoria is shipped as an installable PWA so a tableau feels native on
// both desktop and mobile, and keeps working offline once visited.
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Sensoria',
        short_name: 'Sensoria',
        description: "Galerie d'expériences interactives sensorielles.",
        lang: 'fr',
        theme_color: '#0b0d14',
        background_color: '#0b0d14',
        display: 'fullscreen',
        orientation: 'any',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}']
      }
    })
  ]
});
