import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
 
export default defineConfig({
  plugins: [react()],
 
  server: {
    port: 5173,
    host: true,
 
    proxy: {
      // ── All API routes + HLS → FastAPI (Port 8000) ─────────────────────
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
 
      '/hls': {
        target: 'http://localhost:8000',     // ← Changed to 8000
        changeOrigin: true,
      },
 
    },
 
    hmr: {
      overlay: false,
    },
  },
})
 