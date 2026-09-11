import { test, expect } from "@playwright/test"
import { writeFileSync } from "fs"

/**
 * Certification "Dashboard Operations" — module Omraty, même méthode/même
 * rigueur que dashboard-operations-hotel-lifecycle.spec.ts (voir ce fichier
 * pour le raisonnement complet sur l'ordre créer→rechercher→valider→
 * modifier→annuler, et sur pourquoi c'est le seul ordre qui fonctionne :
 * `verifyManualPayment` exige "pending", "refunded" est terminal).
 *
 * Le back-office (`/admin/reservations/[id]`, VerifyPaymentButton/
 * RefundButton/le dropdown statut) est PARTAGÉ entre tous les modules
 * (`loadReservationDetail` bascule sur `row.module`, voir
 * lib/booking/reservation-detail.ts) — ce test réutilise donc exactement
 * les mêmes actions admin que le cycle Hôtel, sur une VRAIE réservation
 * Omra cette fois (pèlerin réel, allotment réellement décrémenté).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin.test@easy2book.local"
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TestPass123!"

// Package + départ seedés par scripts/seed-base-infra.ts (30 places, agence
// OTA, canal b2c) — voir docs/audits/e2e-certification-report.md.
const PACKAGE_ID = "10000000-0000-0000-0000-000000000001"

test.describe("Dashboard Operations — cycle de vie complet réservation Omra", () => {
  test.setTimeout(120_000)

  test("créer → rechercher → valider → modifier → annuler, via l'UI admin réelle (module Omra)", async ({ page }) => {
    let publicRef = ""

    await test.step("1. CRÉER — B2C guest checkout Omra réel (fiche pèlerin complète)", async () => {
      await page.goto(`/omra/${PACKAGE_ID}/book`)
      await page.waitForLoadState("networkidle")

      await page.getByRole("combobox").first().click()
      // 1ère date de départ proposée (place library : "places", badge count) — la 1ère option listée.
      await page.getByRole("option").first().click()

      const suffix = Date.now().toString().slice(-6)
      await page.getByPlaceholder("Ahmed").fill("Certif")
      await page.getByPlaceholder("Ben Ali").fill(`E2E-${suffix}`)
      await page.locator('input[type="date"]').first().fill("1990-05-15") // birthDate
      await page.getByPlaceholder("TN", { exact: true }).first().fill("TN") // nationalité

      // Genre / Situation matrimoniale — valeurs par défaut déjà correctes
      // (male/single), pas besoin de les changer pour ce test.

      await page.getByPlaceholder("+216 98 123 456").fill("+21698140514")
      await page.getByPlaceholder("email@example.com").fill(`certif-omra-e2e-${suffix}@example.com`)
      await page.getByPlaceholder("A12345678").fill("X1234567")
      // 2ème "TN" placeholder = pays émetteur passeport
      await page.getByPlaceholder("TN", { exact: true }).nth(1).fill("TN")
      const dateInputs = page.locator('input[type="date"]')
      await dateInputs.nth(1).fill("2023-01-01") // passportIssueDate
      await dateInputs.nth(2).fill("2033-01-01") // passportExpiryDate

      // Politique d'annulation — case à cocher UNIQUEMENT si une politique
      // réelle existe pour ce produit (voir cancellation-policy-display.tsx :
      // jamais affichée/exigée s'il n'y a rien à accepter).
      const policyCheckbox = page.locator('[id^="policy-accept-omra-"]')
      if (await policyCheckbox.isVisible().catch(() => false)) {
        await policyCheckbox.check()
      }

      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-omra-01-pilgrim-form.png",
        fullPage: true,
      })

      await page.getByText("Espèces en agence").click()
      await page.getByLabel(/J'accepte les conditions générales de vente d'Easy2Book/).check()
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-omra-02-payment.png",
        fullPage: true,
      })

      await page.getByRole("button", { name: /Confirmer & payer/i }).click()
      await page.waitForURL(/\/booking\/confirmation\//, { timeout: 20_000 })

      const refText = await page.getByText(/^OM-\d{4}-\d{6}$|^TG-\d{4}-\d{6}$/).first().textContent()
      expect(refText).toBeTruthy()
      publicRef = refText!.trim()
      writeFileSync("/tmp/dashboard-ops-omra-ref.json", JSON.stringify({ publicRef }))
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-omra-03-confirmation.png",
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

    await test.step("3. RECHERCHER + VALIDER — liste admin (module Omra), règlement manuel réel", async () => {
      await page.goto(`/admin/reservations?search=${publicRef}`)
      await page.waitForLoadState("networkidle")
      await expect(page.getByText(publicRef).first()).toBeVisible({ timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-omra-04-admin-search.png",
        fullPage: true,
      })

      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })

      const verifyBtn = page.getByRole("button", { name: /^Vérifier$/ })
      await expect(verifyBtn).toBeVisible({ timeout: 10_000 })
      await verifyBtn.click()
      await page.getByLabel(/Référence du règlement/i).fill(`E2E-CASH-OMRA-${Date.now()}`)
      await page.getByRole("button", { name: /Confirmer le règlement/i }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-omra-05-detail-verified.png",
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
        path: "docs/audits/screenshots/dashboard-ops-omra-06-status-modified.png",
        fullPage: true,
      })
    })

    await test.step("5. ANNULER — remboursement réel (état terminal, fait en dernier)", async () => {
      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })

      const refundBtn = page.getByRole("button", { name: /^Rembourser$/ })
      await expect(refundBtn).toBeVisible({ timeout: 10_000 })
      await refundBtn.click()
      await page.getByLabel(/Motif du remboursement/i).fill("Certification E2E Omra — annulation test")
      await page.getByRole("button", { name: /Confirmer le remboursement/i }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-omra-07-detail-refunded.png",
        fullPage: true,
      })
    })
  })
})
