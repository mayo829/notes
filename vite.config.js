import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/notes/',
  optimizeDeps: {
    exclude: ['@xenova/transformers'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3747',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/lang-markdown',
            '@codemirror/autocomplete',
            '@codemirror/search',
          ],
          transformers: ['@xenova/transformers'],
        },
      },
    },
  },
})
