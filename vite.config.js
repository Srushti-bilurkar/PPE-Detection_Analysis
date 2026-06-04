import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {

      // ── Zone overlay routes → Node/index1.js on port 3001 ─────────────
      // These MUST come before the general /api rule (Vite matches top-down)
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

      // ── HLS streams → Node/index1.js on port 3001 ─────────────────────
      '/hls': {
        target:       'http://localhost:3001',
        changeOrigin: true,
      },

      // ── Everything else /api/* → FastAPI on port 8000 ─────────────────
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