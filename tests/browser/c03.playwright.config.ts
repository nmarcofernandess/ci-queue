import { defineConfig } from "@playwright/test"

// Seleciona somente o caso C03 já existente em progress-timing-integrated.spec.ts.
// A prova sobe seu próprio servidor estático do bundle compilado; não inicia Vite.
export default defineConfig({
  globalSetup: "./c03.playwright.setup.ts",
  timeout: 120_000,
  testDir: ".",
  testMatch: /progress-timing-integrated\.spec\.ts$/,
  grep: /C03 same ticket/,
  workers: 1,
  use: { viewport: { width: 1440, height: 1000 } },
})
