import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 0,
    strictPort: false,
    host: 'localhost',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['src-tauri/**', 'node_modules/**', 'dist/**'],
    // Keep TipTap's ESM packages transformed consistently in jsdom.
    deps: {
      inline: [
        /@tiptap\/.*/,
        /@tiptap\/react/,
        /@tiptap\/core/,
        /@tiptap\/starter-kit/,
        /@tiptap\/extension-.*/,
      ],
    },
    esbuild: {
      target: 'es2020',
    },
  },
})
