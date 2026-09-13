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
    // Le client Supabase tourne côté navigateur et appelle directement le
    // mock GoTrue local (NEXT_PUBLIC_SUPABASE_URL=https://localhost:54331,
    // certificat auto-signé, voir .tmp-mock-gotrue/) — jamais un souci en
    // prod (vrai certificat Supabase), uniquement en environnement de test
    // local avec ce mock.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Environnement d'exécution : navigateur pré-installé à un chemin
        // fixe, distinct de la version que @playwright/test téléchargerait
        // normalement — jamais lancer `playwright install` ici.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
})
