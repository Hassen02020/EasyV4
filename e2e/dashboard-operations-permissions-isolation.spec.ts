import { test, expect } from "@playwright/test"
import { readFileSync } from "fs"

/**
 * Complète dashboard-operations-hotel-lifecycle.spec.ts : vérifie
 * PERMISSIONS (un compte non-admin ne peut pas atteindre le back-office
 * Master Admin) et ISOLATION (une agence partenaire différente de celle qui
 * a créé la réservation ne la voit nulle part dans SON espace Pro) sur la
 * MÊME référence réellement créée par le test précédent — lu depuis
 * /tmp/dashboard-ops-ref.json plutôt que recréé, pour ne pas consommer une
 * 2ème fois l'inventaire du Virtual MyGo Supplier.
 */

const PRO_EMAIL = process.env.E2E_PRO_EMAIL ?? "pro.test@easy2book.local"
const PRO_PASSWORD = process.env.E2E_PRO_PASSWORD ?? "TestPass123!"

let publicRef = ""
try {
  publicRef = JSON.parse(readFileSync("/tmp/dashboard-ops-ref.json", "utf8")).publicRef
} catch {
  // Le test précédent n'a pas encore tourné dans cette session — les tests
  // ci-dessous échoueront explicitement (publicRef vide) plutôt que d'être
  // silencieusement ignorés.
}

test.describe("Dashboard Operations — permissions + isolation cross-agence", () => {
  test("PERMISSIONS — un compte partenaire (Pro) ne peut pas atteindre le back-office Master Admin", async ({ page }) => {
    expect(publicRef, "publicRef manquant — exécuter d'abord dashboard-operations-hotel-lifecycle.spec.ts").toBeTruthy()

    await page.goto("/pro/login")
    await page.getByLabel("Email professionnel").fill(PRO_EMAIL)
    await page.getByLabel("Mot de passe", { exact: true }).fill(PRO_PASSWORD)
    await page.getByRole("button", { name: /Accéder à mon Espace Pro/i }).click()
    await page.waitForURL(/\/pro(?!\/login)/, { timeout: 15_000 })

    // Tente d'atteindre directement la liste ADMIN cross-agence avec une
    // session Pro valide — doit être refusé (redirect), jamais afficher la
    // liste des réservations d'autres agences.
    await page.goto(`/admin/reservations?search=${publicRef}`)
    await page.waitForLoadState("networkidle")
    expect(page.url()).not.toContain("/admin/reservations")
    await expect(page.getByText(publicRef)).toHaveCount(0)
    await page.screenshot({
      path: "docs/audits/screenshots/dashboard-ops-10-permissions-pro-blocked-from-admin.png",
      fullPage: true,
    })
  })

  test("ISOLATION — l'agence partenaire de pro.test ne voit PAS une réservation créée sous l'agence OTA", async ({ page }) => {
    expect(publicRef, "publicRef manquant — exécuter d'abord dashboard-operations-hotel-lifecycle.spec.ts").toBeTruthy()

    await page.goto("/pro/login")
    await page.getByLabel("Email professionnel").fill(PRO_EMAIL)
    await page.getByLabel("Mot de passe", { exact: true }).fill(PRO_PASSWORD)
    await page.getByRole("button", { name: /Accéder à mon Espace Pro/i }).click()
    await page.waitForURL(/\/pro(?!\/login)/, { timeout: 15_000 })

    await page.goto("/pro/reservations")
    await page.waitForLoadState("networkidle")
    // La réservation appartient à l'agence OTA (00000000-...0001), pas à
    // celle de pro.test — elle ne doit apparaître nulle part sur cette page
    // scopée agence, jamais la réservation d'une autre agence.
    await expect(page.getByText(publicRef)).toHaveCount(0)
    await page.screenshot({
      path: "docs/audits/screenshots/dashboard-ops-11-isolation-pro-reservations-empty.png",
      fullPage: true,
    })
  })
})
