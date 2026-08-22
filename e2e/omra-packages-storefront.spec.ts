import { test, expect } from "@playwright/test"

/**
 * Omra + Packages — vitrine publique et honnêteté des états vides
 * (Phase 12, Partie 17).
 *
 * N'assume PAS de données de catalogue seedées (aucune disponibilité n'est
 * fabriquée) : vérifie que chaque page rend soit un catalogue réel, soit un
 * état vide honnête — jamais une erreur 500 côté serveur pour un visiteur
 * anonyme, et jamais un CTA de réservation qui mène à un flux mort.
 */

test.describe("Omra — vitrine publique", () => {
  test("/omra répond 200 pour un visiteur anonyme (catalogue réel ou état vide, jamais 500)", async ({ page }) => {
    const response = await page.goto("/omra")
    expect(response?.status()).toBe(200)
    await expect(page.getByRole("heading", { name: /Omra/i }).first()).toBeVisible()
  })

  test("/omra/[id] avec un id inexistant répond 404 (pas de fabrication de contenu)", async ({ page }) => {
    const response = await page.goto("/omra/00000000-0000-0000-0000-000000000000")
    expect(response?.status()).toBe(404)
  })

  test("/omra/[id]/book avec un id inexistant répond 404 (pas d'accès direct au tunnel sans package réel)", async ({ page }) => {
    const response = await page.goto("/omra/00000000-0000-0000-0000-000000000000/book")
    expect(response?.status()).toBe(404)
  })
})

test.describe("Packages — vitrine publique", () => {
  test("/packages répond 200 pour un visiteur anonyme (catalogue réel ou état vide, jamais 500)", async ({ page }) => {
    const response = await page.goto("/packages")
    expect(response?.status()).toBe(200)
    await expect(page.getByText(/Voyages Organisés/i).first()).toBeVisible()
  })

  test("/packages/[slug] avec un slug inexistant répond 404 (pas de fabrication de contenu)", async ({ page }) => {
    const response = await page.goto("/packages/ce-voyage-n-existe-pas")
    expect(response?.status()).toBe(404)
  })

  test("/packages/[slug]/book avec un slug inexistant répond 404", async ({ page }) => {
    const response = await page.goto("/packages/ce-voyage-n-existe-pas/book")
    expect(response?.status()).toBe(404)
  })
})
