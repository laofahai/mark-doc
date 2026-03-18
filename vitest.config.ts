import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

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
    // Fix for TipTap v3 exports issue - inline all TipTap packages
    deps: {
      inline: [
        /@tiptap\/.*/,
        /@tiptap\/react/,
        /@tiptap\/core/,
        /@tiptap\/starter-kit/,
        /@tiptap\/extension-.*/,
      ],
    },
    resolve: {
      alias: {
        '@tiptap/react': resolve(__dirname, 'node_modules/@tiptap/react'),
        '@tiptap/core': resolve(__dirname, 'node_modules/@tiptap/core'),
      },
    },
    // Better module resolution for ESM packages
    esbuild: {
      target: 'es2020',
    },
  },
})
