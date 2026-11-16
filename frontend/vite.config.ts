/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, /api/* is forwarded to FastAPI, so the browser sees one origin and
// we never need to open CORS wider than the deployed frontend.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // `vite preview` reuses this; the Playwright run points it at its own API.
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
