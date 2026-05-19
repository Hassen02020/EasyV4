import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright E2E configuration — Easy2Book.
 *
 * Golden paths :
 *   1. Home → Login → Dashboard
 *   2. Home → Hotels Tunisie → Search results
 *   3. Home → Booking → Travelers → Checkout
 *
 * Usage :
 *   npm run test:e2e          (headless)
 *   npm run test:e2e -- --ui   (mode UI)
 */

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
})
