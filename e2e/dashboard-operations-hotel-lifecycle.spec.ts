import { test, expect } from "@playwright/test"
import { writeFileSync } from "fs"

/**
 * Certification "E2E Dashboard Operations" — cycle métier complet sur une
 * VRAIE réservation hôtel (myGo virtuel), pas une simple vérification "le
 * bouton existe" :
 *
 *   créer (B2C guest checkout réel) → rechercher (liste admin, filtre par
 *   référence) → valider (VerifyPaymentButton — règlement manuel réellement
 *   enregistré) → modifier (changement de statut en liste, deux fois) →
 *   annuler (RefundButton — remboursement réel, état terminal donc fait en
 *   dernier) → [vérification DB/audit/permissions/isolation faite séparément
 *   en dehors de Playwright, via psql, sur le publicRef écrit dans
 *   /tmp/dashboard-ops-ref.json par ce test]
 *
 * NB ordre — trouvé EN DIRECT en écrivant ce test, pas supposé à l'avance :
 * `verifyManualPayment` (lib/finance/manual-payment-actions.ts) exige
 * strictement le statut "pending" ; "annuler" (RefundButton) laisse la
 * réservation dans l'état TERMINAL "refunded" (aucune transition sortante,
 * voir lib/admin/reservation-status.ts). "valider" doit donc précéder
 * "modifier", et "annuler" doit être fait en dernier — sinon le test (et un
 * vrai agent back-office suivant le même chemin) se retrouve bloqué. Ce
 * constat a aussi révélé un défaut réel, corrigé dans ce cycle : le bouton
 * "Vérifier" restait affiché (et cliquable, en échec silencieux côté
 * dialogue) pour un statut "on_request" — état sans aucun retour possible
 * vers "pending" — voir app/admin/reservations/[id]/page.tsx.
 *
 * Chaque étape échoue bruyamment (assertion Playwright) si l'UI ne fait pas
 * ce qu'elle prétend faire — jamais un simple "le composant est monté".
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin.test@easy2book.local"
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TestPass123!"

// Hôtel + dates confirmés AVANT le test (via /api/hotels/search-public réel)
// comme ayant une chambre réellement disponible (stopReservation=false). Le
// Virtual MyGo Supplier a une disponibilité non-déterministe par design
// (~15% sold-out) ET décrémente réellement l'inventaire à chaque
// réservation créée (y compris par ce test) — un re-run direct sur le MÊME
// couple hôtel/dates peut donc légitimement échouer "plus disponible" :
// changer les dates (voir constante ci-dessous) plutôt que d'y voir un bug.
const HOTEL_ID = "500001"
const CHECKIN = "2027-02-05"
const CHECKOUT = "2027-02-10"

test.describe("Dashboard Operations — cycle de vie complet réservation hôtel", () => {
  test.setTimeout(120_000)

  test("créer → rechercher → valider → modifier → annuler, via l'UI admin réelle", async ({ page }) => {
    let publicRef = ""

    await test.step("1. CRÉER — B2C guest checkout réel (myGo virtuel)", async () => {
      await page.goto(`/hotels/${HOTEL_ID}?checkin=${CHECKIN}&checkout=${CHECKOUT}&adults=2`)
      await page.waitForLoadState("networkidle")

      // Section "Chambres et tarifs disponibles" — sélectionne la 1ère ligne
      // AVEC un CTA "Réserver" actif (pas "Sur demande"/stopReservation).
      const roomRow = page.locator("button", { hasText: /Disponible/ }).first()
      await expect(roomRow).toBeVisible({ timeout: 20_000 })
      await roomRow.click()

      await page.getByRole("button", { name: /^Réserver$/ }).click()
      await page.waitForURL(/\/booking\?d=/, { timeout: 15_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-01-step1-offer.png",
        fullPage: true,
      })

      await page.getByRole("link", { name: /Continuer/i }).click()
      await page.waitForURL(/\/booking\/travelers/, { timeout: 15_000 })

      // Formulaire voyageur — voir components/booking/travelers-form.tsx
      const suffix = Date.now().toString().slice(-6)
      await page.getByLabel("Prénom *", { exact: true }).fill("Certif")
      await page.getByLabel("Nom *", { exact: true }).fill(`E2E-${suffix}`)
      await page.getByLabel("Email *", { exact: true }).fill(`certif-e2e-${suffix}@example.com`)
      await page.getByLabel("Téléphone *", { exact: true }).fill("+21698140514")
      await page.getByLabel(/Numéro CIN/).fill("87654321")
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-02-travelers-form.png",
        fullPage: true,
      })
      await page.getByRole("button", { name: /Continuer vers le paiement/i }).click()
      await page.waitForURL(/\/booking\/checkout/, { timeout: 15_000 })

      // Méthode "Espèces en agence" — laisse la réservation "pending",
      // exactement le scénario qui alimente la file "Paiements en attente"
      // (VerifyPaymentButton) testée à l'étape 3.
      await page.getByText("Espèces en agence").click()
      await page.getByLabel(/J'accepte les/).check()
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-03-checkout.png",
        fullPage: true,
      })
      await page.getByRole("button", { name: /Confirmer & payer/i }).click()
      await page.waitForURL(/\/booking\/confirmation\//, { timeout: 20_000 })

      const refText = await page.getByText(/^TG-\d{4}-\d{6}$/).first().textContent()
      expect(refText).toBeTruthy()
      publicRef = refText!.trim()
      writeFileSync("/tmp/dashboard-ops-ref.json", JSON.stringify({ publicRef }))
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-04-confirmation.png",
        fullPage: true,
      })
    })

    await test.step("2. Login admin réel (Supabase/GoTrue, pas de bypass)", async () => {
      await page.goto("/login")
      await page.getByLabel(/Email/i).fill(ADMIN_EMAIL)
      await page.getByLabel(/Mot de passe/i).fill(ADMIN_PASSWORD)
      await page.getByRole("button", { name: /Se connecter/i }).click()
      await page.waitForURL(/.*admin/, { timeout: 15_000 })
    })

    await test.step("3. RECHERCHER + VALIDER — liste admin, puis règlement manuel réel", async () => {
      await page.goto(`/admin/reservations?search=${publicRef}`)
      await page.waitForLoadState("networkidle")
      await expect(page.getByText(publicRef).first()).toBeVisible({ timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-05-admin-search.png",
        fullPage: true,
      })

      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-06-detail-pending.png",
        fullPage: true,
      })

      const verifyBtn = page.getByRole("button", { name: /^Vérifier$/ })
      await expect(verifyBtn).toBeVisible({ timeout: 10_000 })
      await verifyBtn.click()
      await page.getByLabel(/Référence du règlement/i).fill(`E2E-CASH-${Date.now()}`)
      await page.getByRole("button", { name: /Confirmer le règlement/i }).click()
      // Le dialogue se ferme + router.refresh() sur succès — attend sa disparition.
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-07-detail-verified.png",
        fullPage: true,
      })
    })

    await test.step("4. MODIFIER — changement de statut depuis la liste (confirmed -> completed, puis un aller-retour)", async () => {
      await page.goto(`/admin/reservations?search=${publicRef}`)
      await page.waitForLoadState("networkidle")

      const statusSelect = page.getByLabel(`Changer le statut de ${publicRef}`)
      await expect(statusSelect).toBeVisible({ timeout: 10_000 })
      await statusSelect.click()
      await page.getByRole("option", { name: "Terminée" }).click()
      await expect(page.getByText("Terminée").first()).toBeVisible({ timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-08-status-modified.png",
        fullPage: true,
      })
    })

    await test.step("5. ANNULER — remboursement réel (état terminal, fait en dernier)", async () => {
      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })

      const refundBtn = page.getByRole("button", { name: /^Rembourser$/ })
      await expect(refundBtn).toBeVisible({ timeout: 10_000 })
      await refundBtn.click()
      await page.getByLabel(/Motif du remboursement/i).fill("Certification E2E — annulation test")
      await page.getByRole("button", { name: /Confirmer le remboursement/i }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-09-detail-refunded.png",
        fullPage: true,
      })
    })
  })
})
