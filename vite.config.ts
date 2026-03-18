import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 1420,
    strictPort: false,
    host: 'localhost',
  },
  optimizeDeps: {
    include: ['use-sync-external-store/shim'],
    exclude: ['@tauri-apps/plugin-fs', '@tauri-apps/plugin-dialog'],
  },
})
