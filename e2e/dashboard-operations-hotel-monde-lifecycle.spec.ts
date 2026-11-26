import { test, expect } from "@playwright/test"

/**
 * M10 — les offres du Virtual World Hotel Supplier sont des démonstrations.
 * Le parcours public doit refuser la réservation côté serveur avant toute
 * création de réservation, paiement, facture ou commission.
 */
const DESTINATION = "istanbul"
const CHECK_IN = "2027-03-15"
const CHECK_OUT = "2027-03-18"

test.describe("M10 — blocage serveur des réservations Hôtels Monde démo", () => {
  test("le checkout refuse une offre virtuelle et ne confirme aucune réservation", async ({
    page,
  }) => {
    await page.goto(
      `/hotels-monde/search?destination=${DESTINATION}&checkIn=${CHECK_IN}&checkOut=${CHECK_OUT}&adults=1&rooms=1`,
    )
    await page.waitForLoadState("networkidle")

    const reserveBtn = page.getByRole("link", { name: /^Réserver$/ }).first()
    await expect(reserveBtn).toBeVisible({ timeout: 20_000 })
    await reserveBtn.click()
    await page.waitForURL(/\/hotels-monde\/book\?/, { timeout: 15_000 })

    await page.getByLabel("Prénom *", { exact: true }).fill("Test")
    await page.getByLabel("Nom *", { exact: true }).fill("M10")
    await page
      .getByLabel("Email *", { exact: true })
      .fill("m10-demo-block@example.com")
    await page
      .getByLabel("Téléphone *", { exact: true })
      .fill("+216 98 140 514")
    await page.getByText("Espèces en agence").click()
    await page
      .getByLabel(/J'accepte les conditions générales de vente d'Easy2Book/)
      .check()
    await page.getByLabel(/j'accepte la politique d'annulation/i).check()

    await page.getByRole("button", { name: /Confirmer & payer/i }).click()

    await expect(page.getByRole("alert")).toContainText(
      /offres de démonstration/i,
      { timeout: 10_000 },
    )
    await expect(page).toHaveURL(/\/hotels-monde\/book\?/)
    await expect(page).not.toHaveURL(/\/booking\/confirmation\//)
  })
})
