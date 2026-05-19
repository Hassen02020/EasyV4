import { test, expect } from "@playwright/test"

/**
 * Golden path 1 : Accueil → Login → Dashboard admin.
 *
 * Prérequis :
 *   - L'application doit tourner (npm run dev)
 *   - Un compte de test existant (email + password) dans Supabase
 *
 * Variables d'environnement :
 *   E2E_TEST_EMAIL    (défaut: test@example.com)
 *   E2E_TEST_PASSWORD (défaut: password123)
 */

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "test@example.com"
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "password123"

test.describe("Authentification", () => {
  test("navigue de l'accueil vers le login puis le dashboard", async ({
    page,
  }) => {
    // 1. Accueil
    await page.goto("/")
    await expect(page).toHaveTitle(/Easy2Book/)

    // 2. Navigation vers login
    await page.getByRole("link", { name: /Connexion/i }).click()
    await expect(page).toHaveURL(/.*login/)

    // 3. Formulaire de login
    await page.getByLabel(/Email/i).fill(TEST_EMAIL)
    await page.getByLabel(/Mot de passe/i).fill(TEST_PASSWORD)
    await page.getByRole("button", { name: /Se connecter/i }).click()

    // 4. Dashboard (avec timeout généreux pour le redirect Supabase)
    await page.waitForURL(/.*admin/, { timeout: 10_000 })
    await expect(page.getByRole("heading", { name: /Tableau de bord/i })).toBeVisible()
  })
})
