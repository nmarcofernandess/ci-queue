import { defineConfig } from '@playwright/test'
export default defineConfig({
  timeout: 120_000,
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5191', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm --prefix ui run dev -- --host 127.0.0.1 --port 5191 --strictPort', url: 'http://127.0.0.1:5191', reuseExistingServer: true },
})
