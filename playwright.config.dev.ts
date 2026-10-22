import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config — mode développement (E1-01/E4-02 / VAL-01).
 *
 * Différences vs playwright.config.ts :
 *  - webServer.command = "pnpm dev" (toujours, y compris en CI)
 *    → NODE_ENV=development → MYGO_MODE=virtual autorisé
 *    → resolveMyGoMode() ne lève pas l'exception "production"
 *  - webServer.timeout = 120 000 ms (Turbopack cold-start CI)
 *  - workers = 1 (toujours — dev server ne supporte pas la parallélisation)
 *  - projects = chromium seulement (vitesse CI)
 *
 * Usage local :
 *   MYGO_MODE=virtual pnpm exec playwright test \
 *     e2e/b2c-hotel-guest-create-live.spec.ts \
 *     --config playwright.config.dev.ts --project chromium
 *
 * Usage CI : job e2e-guest dans .github/workflows/ci.yml
 */

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    locale: "fr-FR",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
  webServer: {
    // Toujours pnpm dev — MYGO_MODE=virtual incompatible avec pnpm start
    // (NODE_ENV=production → resolveMyGoMode() throw).
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
