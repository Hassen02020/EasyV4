import { test, expect } from "@playwright/test"
import { writeFileSync } from "fs"

/**
 * Certification "Dashboard Operations" — module Hôtels Monde (Virtual World
 * Hotel Supplier), même méthode que
 * dashboard-operations-flight-lifecycle.spec.ts (voir
 * dashboard-operations-hotel-lifecycle.spec.ts pour le raisonnement complet
 * sur l'ordre créer→rechercher→valider→modifier→annuler). Réutilise le MÊME
 * back-office partagé (`/admin/reservations/[id]`) — deuxième module validé
 * dont l'inventaire n'est ni un allotement DB (Omra/Package/Activity) ni myGo
 * (Hôtel Tunisie), mais le Virtual World Hotel Supplier
 * (lib/hotels-monde/virtual-supplier/) : décrément réel côté engine.book()
 * avant même l'insertion en base, numéro de confirmation émis, jamais un
 * simple enregistrement sans qu'un "fournisseur" confirme quoi que ce soit.
 *
 * Limitation connue (documentée, pas un bug de ce test), identique à Vols :
 * "hotel_monde" n'est PAS dans CANCELLABLE_MODULES
 * (lib/booking/policy-cancel-core.ts, scopé aux 3 modules à stock LOCAL
 * Omra/Package/Activity) — un remboursement staff marque donc la réservation
 * `refunded` en base mais NE restitue PAS l'inventaire virtuel réservé
 * (même limitation déjà acceptée pour Hôtel Tunisie et Vols). L'étape 5
 * vérifie uniquement le remboursement DB/UI, pas une restitution
 * d'inventaire fournisseur.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin.test@easy2book.local"
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TestPass123!"

// Destination/dates arbitraires — le Virtual World Hotel Supplier génère des
// offres déterministes pour N'IMPORTE QUELLE destination/dates connues de
// POPULAR_DESTINATIONS (lib/hotels-monde/virtual-supplier/catalog.ts) : pas
// d'"hôtel seedé" à maintenir, même principe que Vols.
const DESTINATION = "istanbul"
const CHECK_IN = "2027-03-15"
const CHECK_OUT = "2027-03-18"

test.describe("Dashboard Operations — cycle de vie complet réservation Hôtel Monde", () => {
  test.setTimeout(120_000)

  test("créer → rechercher → valider → modifier → annuler, via l'UI admin réelle (module Hôtel Monde)", async ({ page }) => {
    let publicRef = ""

    await test.step("1. CRÉER — B2C guest checkout Hôtel Monde réel (Virtual World Hotel Supplier)", async () => {
      await page.goto(
        `/hotels-monde/search?destination=${DESTINATION}&checkIn=${CHECK_IN}&checkOut=${CHECK_OUT}&adults=1&rooms=1`,
      )
      await page.waitForLoadState("networkidle")

      const reserveBtn = page.getByRole("link", { name: /^Réserver$/ }).first()
      await expect(reserveBtn).toBeVisible({ timeout: 20_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-hotel-monde-01-results.png",
        fullPage: true,
      })
      await reserveBtn.click()
      await page.waitForURL(/\/hotels-monde\/book\?/, { timeout: 15_000 })

      const suffix = Date.now().toString().slice(-6)
      await page.getByLabel("Prénom *", { exact: true }).fill("Certif")
      await page.getByLabel("Nom *", { exact: true }).fill(`E2E-${suffix}`)
      await page.getByLabel("Email *", { exact: true }).fill(`certif-hotel-monde-e2e-${suffix}@example.com`)
      await page.getByLabel("Téléphone *", { exact: true }).fill("+216 98 140 514")
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-hotel-monde-02-form.png",
        fullPage: true,
      })

      await page.getByText("Espèces en agence").click()
      await page.getByLabel(/J'accepte les conditions générales de vente d'Easy2Book/).check()
      await page.getByRole("button", { name: /Confirmer & payer/i }).click()
      await page.waitForURL(/\/booking\/confirmation\//, { timeout: 20_000 })

      const refText = await page.getByText(/^WH-\d{4}-\d{6}$/).first().textContent()
      expect(refText).toBeTruthy()
      publicRef = refText!.trim()
      writeFileSync("/tmp/dashboard-ops-hotel-monde-ref.json", JSON.stringify({ publicRef }))
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-hotel-monde-03-confirmation.png",
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

    await test.step("3. RECHERCHER + VALIDER — liste admin (module Hôtel Monde), règlement manuel réel", async () => {
      await page.goto(`/admin/reservations?search=${publicRef}`)
      await page.waitForLoadState("networkidle")
      await expect(page.getByText(publicRef).first()).toBeVisible({ timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-hotel-monde-04-admin-search.png",
        fullPage: true,
      })

      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })

      // Détail module ("(Hôtel Monde)") — preuve que loadModuleDetail() gère
      // réellement "hotel_monde", pas juste un fallback générique ni le
      // module "hotel" (Hôtels Tunisie) déjà certifié.
      await expect(page.getByText(/\(Hôtel Monde\)/)).toBeVisible({ timeout: 10_000 })

      const verifyBtn = page.getByRole("button", { name: /^Vérifier$/ })
      await expect(verifyBtn).toBeVisible({ timeout: 10_000 })
      await verifyBtn.click()
      await page.getByLabel(/Référence du règlement/i).fill(`E2E-CASH-WH-${Date.now()}`)
      await page.getByRole("button", { name: /Confirmer le règlement/i }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-hotel-monde-05-detail-verified.png",
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
        path: "docs/audits/screenshots/dashboard-ops-hotel-monde-06-status-modified.png",
        fullPage: true,
      })
    })

    await test.step("5. ANNULER — remboursement réel (état terminal fait en dernier)", async () => {
      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })

      const refundBtn = page.getByRole("button", { name: /^Rembourser$/ })
      await expect(refundBtn).toBeVisible({ timeout: 10_000 })
      await refundBtn.click()
      await page.getByLabel(/Motif du remboursement/i).fill("Certification E2E Hôtel Monde — annulation test")
      await page.getByRole("button", { name: /Confirmer le remboursement/i }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({
        path: "docs/audits/screenshots/dashboard-ops-hotel-monde-07-detail-refunded.png",
        fullPage: true,
      })
    })
  })
})
