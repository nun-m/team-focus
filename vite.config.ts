import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 開発中は /api をAPIサーバー(server/index.js)へ中継する
const apiPort = process.env.TEAM_FOCUS_PORT || '3002'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
})
