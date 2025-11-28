import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/predict': 'http://127.0.0.1:8080/',
      '/status': 'http://127.0.0.1:8080/',
      '/result': 'http://127.0.0.1:8080/',
      '/overlap': 'http://127.0.0.1:8080/',
    },
  },
  build: {
    outDir: 'app/ui',
    emptyOutDir: true,
  },
})
