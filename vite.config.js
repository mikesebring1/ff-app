import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Madtown\'s Finest Fantasy Football League',
        short_name: 'Madtown\'s Finest',
        description: 'Madtown\'s Finest Fantasy Football League - Established 2012. Track standings with our unique \'vs everyone\' scoring format.',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/'
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src')
    }
  }
})
