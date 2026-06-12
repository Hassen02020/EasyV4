import { test, expect } from "@playwright/test"

/**
 * Golden path 3 : Booking complet — Home → Offer → Travelers → Checkout.
 *
 * Ce test simule un parcours de réservation via le bouton "Réserver"
 * sur une offre flash de la home page.
 */

test.describe("Parcours de réservation", () => {
  test("réserve une offre flash jusqu'au checkout", async ({ page }) => {
    await page.goto("/")

    // 1. Clique sur la première offre flash "Réserver"
    const bookButton = page.getByRole("button", { name: /Réserver/i }).first()
    await expect(bookButton).toBeVisible()
    await bookButton.click()

    // 2. Page booking (étape 1)
    await page.waitForURL(/.*booking\?d=.*/)
    await expect(
      page.getByRole("heading", { name: /Détails de l'offre/i }),
    ).toBeVisible()

    // 3. Continue vers voyageurs
    await page.getByRole("button", { name: /Continuer/i }).click()

    // 4. Page travelers (étape 2)
    await page.waitForURL(/.*booking\/travelers.*/)
    await expect(
      page.getByRole("heading", { name: /Coordonnées du voyageur/i }),
    ).toBeVisible()

    // 5. Remplit le formulaire voyageur
    await page.getByLabel(/Prénom/i).fill("Test")
    await page.getByLabel(/Nom/i).fill("Playwright")
    await page.getByLabel(/Email/i).fill("test@example.com")
    await page.getByLabel(/Téléphone/i).fill("+21698123456")

    // 6. Continue vers checkout
    await page.getByRole("button", { name: /Continuer/i }).click()

    // 7. Page checkout (étape 3)
    await page.waitForURL(/.*booking\/checkout.*/)
    await expect(page.getByRole("heading", { name: /Paiement/i })).toBeVisible()
  })
})
