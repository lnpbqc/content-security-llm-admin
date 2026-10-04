import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [vue()],
    server: { proxy: {
      '/api': { target: env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8001', changeOrigin: true },
      '/__api_health': { target: env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8001', changeOrigin: true, rewrite: () => '/' },
    } },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
