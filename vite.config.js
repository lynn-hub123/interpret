import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/interpret/',
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: false
  }
})
