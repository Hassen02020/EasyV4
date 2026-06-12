import { test, expect } from "@playwright/test"

/**
 * Golden path 2 : Accueil → Recherche Hôtels Tunisie → Résultats.
 *
 * Ce test utilise le mode démo (fixture JSON) si les credentials myGo
 * ne sont pas configurés.
 */

test.describe("Recherche Hôtels Tunisie", () => {
  test("remplit le moteur et affiche les résultats", async ({ page }) => {
    await page.goto("/")

    // 1. Sélectionne l'onglet Hôtels Tunisie
    await page.getByRole("tab", { name: /Hôtels Tunisie/i }).click()

    // 2. Sélectionne une ville (Hammamet est dans le fallback)
    await page.getByRole("combobox", { name: /Destination/i }).click()
    await page.getByText("Hammamet").first().click()

    // 3. Sélectionne des dates (range picker)
    await page.getByRole("combobox", { name: /Dates du séjour/i }).click()
    // Clique sur aujourd'hui + 7 jours
    const today = new Date()
    const checkIn = new Date(today)
    checkIn.setDate(today.getDate() + 7)
    const checkOut = new Date(today)
    checkOut.setDate(today.getDate() + 14)

    await page
      .getByRole("gridcell", { name: String(checkIn.getDate()) })
      .first()
      .click()
    await page
      .getByRole("gridcell", { name: String(checkOut.getDate()) })
      .first()
      .click()

    // 4. Recherche
    await page.getByRole("button", { name: /RECHERCHER/i }).click()

    // 5. Page de résultats
    await page.waitForURL(/.*hotels\/search.*/)
    await expect(page.getByRole("heading", { name: /résultat/i })).toBeVisible({
      timeout: 15_000,
    })
  })
})
