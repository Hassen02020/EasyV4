import { test, expect } from "@playwright/test"
import { writeFileSync } from "fs"

/**
 * Certification "Dashboard Operations" — module Attractions, même méthode
 * que les 3 autres cycles (voir dashboard-operations-hotel-lifecycle.spec.ts
 * pour le raisonnement complet sur l'ordre créer→rechercher→valider→
 * modifier→annuler). Quatrième et dernier module à valider que
 * `releaseStock()` (lib/finance/refund-actions.ts) libère bien
 * `catalog_activity_sessions.booked` sur remboursement staff.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin.test@easy2book.local"
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TestPass123!"

// Activité + session seedées (agence OTA, canal b2c, 20/20 places libres au
// moment de l'écriture de ce test) — voir docs/audits/e2e-certification-report.md.
const ACTIVITY_SLUG = "jeep-safari-djerba"

test.describe("Dashboard Operations — cycle de vie complet réservation Activité", () => {
  test.setTimeout(120_000)

  test("créer → rechercher → valider → modifier → annuler, via l'UI admin réelle (module Activité)", async ({ page }) => {
    let publicRef = ""

    await test.step("1. CRÉER — B2C guest checkout Activité réel", async () => {
      await page.goto(`/attractions/${ACTIVITY_SLUG}/book`)
      await page.waitForLoadState("networkidle")

      await page.getByRole("combobox").first().click()
      await page.getByRole("option").first().click()

      const suffix = Date.now().toString().slice(-6)
      await page.getByPlaceholder("Hassen").fill("Certif")
      await page.getByPlaceholder("Tarhouni").fill(`E2E-${suffix}`)
      await page.getByPlaceholder("vous@email.tn").fill(`certif-act-e2e-${suffix}@example.com`)
      await page.getByPlaceholder("+216 98 140 514").fill("+21698140514")
      await page.getByPlaceholder("12345678").fill("87654321")

      const policyCheckbox = page.locator('[id^="policy-accept-activity-"]')
      if (await policyCheckbox.isVisible().catch(() => false)) {
        await policyCheckbox.check()
      }

      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-activity-01-form.png",
        fullPage: true,
      })

      await page.getByText("Espèces en agence").click()
      await page.getByLabel(/J'accepte les conditions générales de vente d'Easy2Book/).check()
      await page.getByRole("button", { name: /Confirmer & payer/i }).click()
      await page.waitForURL(/\/booking\/confirmation\//, { timeout: 20_000 })

      const refText = await page.getByText(/^AT-\d{4}-\d{6}$|^TG-\d{4}-\d{6}$/).first().textContent()
      expect(refText).toBeTruthy()
      publicRef = refText!.trim()
      writeFileSync("/tmp/dashboard-ops-activity-ref.json", JSON.stringify({ publicRef }))
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-activity-02-confirmation.png",
        fullPage: true,
      })
    })

    await test.step("2. Login admin réel", async () => {
      await page.goto("/login")
      await page.getByLabel(/Email/i).fill(ADMIN_EMAIL)
      await page.getByLabel(/Mot de passe/i).fill(ADMIN_PASSWORD)
      await page.getByRole("button", { name: /Se connecter/i }).click()
      await page.waitForURL(/.*admin/, { timeout: 15_000 })
    })

    await test.step("3. RECHERCHER + VALIDER — liste admin (module Activité), règlement manuel réel", async () => {
      await page.goto(`/admin/reservations?search=${publicRef}`)
      await page.waitForLoadState("networkidle")
      await expect(page.getByText(publicRef).first()).toBeVisible({ timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-activity-03-admin-search.png",
        fullPage: true,
      })

      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })

      const verifyBtn = page.getByRole("button", { name: /^Vérifier$/ })
      await expect(verifyBtn).toBeVisible({ timeout: 10_000 })
      await verifyBtn.click()
      await page.getByLabel(/Référence du règlement/i).fill(`E2E-CASH-ACT-${Date.now()}`)
      await page.getByRole("button", { name: /Confirmer le règlement/i }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-activity-04-detail-verified.png",
        fullPage: true,
      })
    })

    await test.step("4. MODIFIER — changement de statut depuis la liste (confirmed -> completed)", async () => {
      await page.goto(`/admin/reservations?search=${publicRef}`)
      await page.waitForLoadState("networkidle")
      const statusSelect = page.getByLabel(`Changer le statut de ${publicRef}`)
      await expect(statusSelect).toBeVisible({ timeout: 10_000 })
      await statusSelect.click()
      await page.getByRole("option", { name: "Terminée" }).click()
      await expect(page.getByText("Terminée").first()).toBeVisible({ timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-activity-05-status-modified.png",
        fullPage: true,
      })
    })

    await test.step("5. ANNULER — remboursement réel (libère booked, état terminal fait en dernier)", async () => {
      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })

      const refundBtn = page.getByRole("button", { name: /^Rembourser$/ })
      await expect(refundBtn).toBeVisible({ timeout: 10_000 })
      await refundBtn.click()
      await page.getByLabel(/Motif du remboursement/i).fill("Certification E2E Activité — annulation test")
      await page.getByRole("button", { name: /Confirmer le remboursement/i }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-activity-06-detail-refunded.png",
        fullPage: true,
      })
    })
  })
})
