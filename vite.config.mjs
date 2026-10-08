import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  root: 'src/renderer', base: './', plugins: [vue()],
  build: { outDir: '../../dist', emptyOutDir: true, target: 'chrome138', rollupOptions: { input: { main: 'src/renderer/index.html', lyrics: 'src/renderer/lyrics.html' } } }
})
