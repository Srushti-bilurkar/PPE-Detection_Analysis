import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {

      // ── Routes served by Node/index1.js on port 3001 ──────────────────
      // These must come BEFORE the general /api rule below
      // because Vite matches proxy rules top-to-bottom

      '/api/cameras': {
        target:       'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/zone-map': {
        target:       'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/zone-confidence': {
        target:       'http://localhost:3001',
        changeOrigin: true,
      },

      // ── HLS streams — also served by Node on port 3001 ────────────────
      '/hls': {
        target:       'http://localhost:3001',
        changeOrigin: true,
      },

      // ── Everything else /api/* → Python FastAPI on port 8000 ──────────
      '/api': {
        target:       'http://localhost:8000',
        changeOrigin: true,
      },

    },
    hmr: {
      overlay: false,
    },
  },
})