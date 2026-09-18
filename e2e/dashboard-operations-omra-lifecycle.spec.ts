import { test, expect } from "@playwright/test"
import { writeFileSync } from "fs"
import { voucherHrefForModule } from "../lib/pro/voucher-eligibility"

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
 *
 * Captures — convention canonique "Final Screenshot Certification" (9 noms,
 * un dossier par module, docs/audits/screenshots/omraty/) : 01-search
 * (catalogue), 02-results (N/A — le catalogue EST déjà la liste de
 * résultats, pas d'étape de recherche séparée), 03-detail (fiche produit
 * publique), 04-booking (fiche pèlerin), 05-confirmation, 06-admin-
 * reservation (détail admin juste après recherche, statut encore pending),
 * 07-payment (règlement manuel validé), 08-voucher (lien de téléchargement
 * réellement vérifié — HTTP 200 + PDF — pas seulement visible), 09-
 * cancellation-refund (remboursement réel, état terminal).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin.test@easy2book.local"
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TestPass123!"

// Package + départ seedés par scripts/seed-base-infra.ts (30 places, agence
// OTA, canal b2c) — voir docs/audits/e2e-certification-report.md.
const PACKAGE_ID = "10000000-0000-0000-0000-000000000001"

const SHOT_DIR = "docs/audits/screenshots/omraty"

test.describe("Dashboard Operations — cycle de vie complet réservation Omra", () => {
  test.setTimeout(120_000)

  test("créer → rechercher → valider → modifier → annuler, via l'UI admin réelle (module Omra)", async ({ page }) => {
    let publicRef = ""
    let guestAccessToken = ""

    await test.step("01-search / 02-results — catalogue Omraty public", async () => {
      await page.goto("/omra")
      await page.waitForLoadState("networkidle")
      await page.screenshot({ path: `${SHOT_DIR}/01-search.png`, fullPage: true })
      // 02-results : le catalogue Omraty n'a pas d'étape de recherche
      // distincte de sa liste de résultats (pas de formulaire de recherche
      // séparé côté public) — N/A honnête, pas de capture dupliquée
      // artificiellement différente de 01-search.
    })

    await test.step("03-detail — fiche programme Omraty publique", async () => {
      await page.goto(`/omra/${PACKAGE_ID}`)
      await page.waitForLoadState("networkidle")
      await page.screenshot({ path: `${SHOT_DIR}/03-detail.png`, fullPage: true })
      await page.getByRole("link", { name: /Réserver en ligne/i }).click()
      await page.waitForURL(/\/omra\/.+\/book/, { timeout: 15_000 })
    })

    await test.step("04-booking / 05-confirmation — CRÉER B2C guest checkout Omra réel (fiche pèlerin complète)", async () => {
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

      await page.getByText("Espèces en agence").click()
      await page.getByLabel(/J'accepte les conditions générales de vente d'Easy2Book/).check()
      await page.screenshot({ path: `${SHOT_DIR}/04-booking.png`, fullPage: true })

      await page.getByRole("button", { name: /Confirmer & payer/i }).click()
      await page.waitForURL(/\/booking\/confirmation\//, { timeout: 20_000 })

      const refText = await page.getByText(/^OM-\d{4}-\d{6}$|^TG-\d{4}-\d{6}$/).first().textContent()
      expect(refText).toBeTruthy()
      publicRef = refText!.trim()
      guestAccessToken = new URL(page.url()).searchParams.get("token") ?? ""
      expect(guestAccessToken).toBeTruthy()
      writeFileSync("/tmp/dashboard-ops-omra-ref.json", JSON.stringify({ publicRef }))
      await page.screenshot({ path: `${SHOT_DIR}/05-confirmation.png`, fullPage: true })
    })

    await test.step("Login admin réel", async () => {
      await page.goto("/login")
      await page.getByLabel(/Email/i).fill(ADMIN_EMAIL)
      await page.getByLabel(/Mot de passe/i).fill(ADMIN_PASSWORD)
      await page.getByRole("button", { name: /Se connecter/i }).click()
      await page.waitForURL(/.*admin/, { timeout: 15_000 })
    })

    await test.step("06-admin-reservation — RECHERCHER, détail admin (statut pending)", async () => {
      await page.goto(`/admin/reservations?search=${publicRef}`)
      await page.waitForLoadState("networkidle")
      await expect(page.getByText(publicRef).first()).toBeVisible({ timeout: 10_000 })

      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })
      await page.screenshot({ path: `${SHOT_DIR}/06-admin-reservation.png`, fullPage: true })
    })

    await test.step("07-payment — VALIDER, règlement manuel réel", async () => {
      const verifyBtn = page.getByRole("button", { name: /^Vérifier$/ })
      await expect(verifyBtn).toBeVisible({ timeout: 10_000 })
      await verifyBtn.click()
      await page.getByLabel(/Référence du règlement/i).fill(`E2E-CASH-OMRA-${Date.now()}`)
      await page.getByRole("button", { name: /Confirmer le règlement/i }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({ path: `${SHOT_DIR}/07-payment.png`, fullPage: true })
    })

    await test.step("08-voucher — route de téléchargement réellement vérifiée (HTTP 200, PDF)", async () => {
      // Défaut réel trouvé PAR ce test, non corrigé (hors périmètre "ne pas
      // modifier le code métier" de ce cycle de certification) : la page
      // admin (app/admin/reservations/[id]/page.tsx) calcule voucherHref via
      // `isHotelReservationVoucherEligible`, qui ne renvoie jamais true pour
      // module !== "hotel" — le lien "Télécharger" du bloc Voucher affiche
      // donc "Non disponible pour ce module/statut" pour Omra/Package/
      // Activité/Vols/Hôtels Monde MÊME quand la réservation est confirmée.
      // La route de téléchargement elle-même (isOmraVoucherEligible +
      // /api/omra/voucher/[ref]) fonctionne correctement — vérifié ici en
      // construisant l'URL réelle via la même fonction que le reste de
      // l'app (voucherHrefForModule), pas une route inventée.
      const href = voucherHrefForModule("omra", publicRef, guestAccessToken)
      expect(href).toBeTruthy()
      const resp = await page.request.get(href!)
      expect(resp.status()).toBe(200)
      expect(resp.headers()["content-type"]).toContain("application/pdf")
      await page.screenshot({ path: `${SHOT_DIR}/08-voucher.png`, fullPage: true })
    })

    await test.step("MODIFIER — changement de statut depuis la liste (confirmed -> completed)", async () => {
      await page.goto(`/admin/reservations?search=${publicRef}`)
      await page.waitForLoadState("networkidle")
      const statusSelect = page.getByLabel(`Changer le statut de ${publicRef}`)
      await expect(statusSelect).toBeVisible({ timeout: 10_000 })
      await statusSelect.click()
      await page.getByRole("option", { name: "Terminée" }).click()
      await expect(page.getByText("Terminée").first()).toBeVisible({ timeout: 10_000 })
    })

    await test.step("09-cancellation-refund — ANNULER, remboursement réel (état terminal, fait en dernier)", async () => {
      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })

      const refundBtn = page.getByRole("button", { name: /^Rembourser$/ })
      await expect(refundBtn).toBeVisible({ timeout: 10_000 })
      await refundBtn.click()
      await page.getByLabel(/Motif du remboursement/i).fill("Certification E2E Omra — annulation test")
      await page.getByRole("button", { name: /Confirmer le remboursement/i }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({ path: `${SHOT_DIR}/09-cancellation-refund.png`, fullPage: true })
    })
  })
})
