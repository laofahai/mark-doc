import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { headless: true, baseURL: 'http://localhost:1422' },
  webServer: {
    command: 'pnpm exec vite --port 1422',
    url: 'http://localhost:1422',
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
