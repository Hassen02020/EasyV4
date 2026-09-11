import { test, expect } from "@playwright/test"
import { writeFileSync } from "fs"
import { voucherHrefForModule } from "../lib/pro/voucher-eligibility"

/**
 * Certification "Dashboard Operations" — module Hôtels Monde (Virtual World
 * Hotel Supplier), même méthode que
 * dashboard-operations-flight-lifecycle.spec.ts (voir
 * dashboard-operations-hotel-lifecycle.spec.ts pour le raisonnement complet
 * sur l'ordre créer→rechercher→valider→modifier→annuler). Réutilise le MÊME
 * back-office partagé (`/admin/reservations/[id]`) — deuxième module validé
 * dont l'inventaire n'est ni un allotement DB (Omra/Package/Activity) ni
 * myGo (Hôtel Tunisie), mais le Virtual World Hotel Supplier
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
 *
 * Captures — convention canonique "Final Screenshot Certification" (voir
 * dashboard-operations-omra-lifecycle.spec.ts pour le détail complet du
 * mapping des 9 noms), docs/audits/screenshots/hotels-monde/. 03-detail :
 * N/A — le moteur Hôtels Monde réserve directement depuis la liste de
 * résultats (query params signés vers /hotels-monde/book), il n'existe pas
 * de page "détail offre" séparée.
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

const SHOT_DIR = "docs/audits/screenshots/hotels-monde"

test.describe("Dashboard Operations — cycle de vie complet réservation Hôtel Monde", () => {
  test.setTimeout(120_000)

  test("créer → rechercher → valider → modifier → annuler, via l'UI admin réelle (module Hôtel Monde)", async ({ page }) => {
    let publicRef = ""
    let guestAccessToken = ""

    await test.step("01-search — formulaire de recherche Hôtels Monde", async () => {
      await page.goto("/hotels-monde")
      await page.waitForLoadState("networkidle")
      await page.screenshot({ path: `${SHOT_DIR}/01-search.png`, fullPage: true })
    })

    await test.step("02-results / 03-detail — résultats de recherche réels (Virtual World Hotel Supplier)", async () => {
      await page.goto(
        `/hotels-monde/search?destination=${DESTINATION}&checkIn=${CHECK_IN}&checkOut=${CHECK_OUT}&adults=1&rooms=1`,
      )
      await page.waitForLoadState("networkidle")

      const reserveBtn = page.getByRole("link", { name: /^Réserver$/ }).first()
      await expect(reserveBtn).toBeVisible({ timeout: 20_000 })
      await page.screenshot({ path: `${SHOT_DIR}/02-results.png`, fullPage: true })
      // 03-detail : N/A — pas de page détail séparée, voir en-tête de fichier.

      await reserveBtn.click()
      await page.waitForURL(/\/hotels-monde\/book\?/, { timeout: 15_000 })
    })

    await test.step("04-booking / 05-confirmation — CRÉER B2C guest checkout Hôtel Monde réel", async () => {
      const suffix = Date.now().toString().slice(-6)
      await page.getByLabel("Prénom *", { exact: true }).fill("Certif")
      await page.getByLabel("Nom *", { exact: true }).fill(`E2E-${suffix}`)
      await page.getByLabel("Email *", { exact: true }).fill(`certif-hotel-monde-e2e-${suffix}@example.com`)
      await page.getByLabel("Téléphone *", { exact: true }).fill("+216 98 140 514")

      await page.getByText("Espèces en agence").click()
      await page.getByLabel(/J'accepte les conditions générales de vente d'Easy2Book/).check()
      await page.screenshot({ path: `${SHOT_DIR}/04-booking.png`, fullPage: true })

      await page.getByRole("button", { name: /Confirmer & payer/i }).click()
      await page.waitForURL(/\/booking\/confirmation\//, { timeout: 20_000 })

      const refText = await page.getByText(/^WH-\d{4}-\d{6}$/).first().textContent()
      expect(refText).toBeTruthy()
      publicRef = refText!.trim()
      guestAccessToken = new URL(page.url()).searchParams.get("token") ?? ""
      expect(guestAccessToken).toBeTruthy()
      writeFileSync("/tmp/dashboard-ops-hotel-monde-ref.json", JSON.stringify({ publicRef }))
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

      // Détail module ("(Hôtel Monde)") — preuve que loadModuleDetail() gère
      // réellement "hotel_monde", pas juste un fallback générique ni le
      // module "hotel" (Hôtels Tunisie) déjà certifié.
      await expect(page.getByText(/\(Hôtel Monde\)/)).toBeVisible({ timeout: 10_000 })
      await page.screenshot({ path: `${SHOT_DIR}/06-admin-reservation.png`, fullPage: true })
    })

    await test.step("07-payment — VALIDER, règlement manuel réel", async () => {
      const verifyBtn = page.getByRole("button", { name: /^Vérifier$/ })
      await expect(verifyBtn).toBeVisible({ timeout: 10_000 })
      await verifyBtn.click()
      await page.getByLabel(/Référence du règlement/i).fill(`E2E-CASH-WH-${Date.now()}`)
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
      // La route de téléchargement elle-même (isWorldHotelVoucherEligible +
      // /api/hotels-monde/voucher/[ref]) fonctionne correctement — vérifié
      // ici en construisant l'URL réelle via la même fonction que le reste
      // de l'app (voucherHrefForModule), pas une route inventée.
      const href = voucherHrefForModule("hotel_monde", publicRef, guestAccessToken)
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

    await test.step("09-cancellation-refund — ANNULER, remboursement réel (état terminal fait en dernier)", async () => {
      await page.getByText(publicRef).first().click()
      await page.waitForURL(/\/admin\/reservations\/[^/]+$/, { timeout: 10_000 })

      const refundBtn = page.getByRole("button", { name: /^Rembourser$/ })
      await expect(refundBtn).toBeVisible({ timeout: 10_000 })
      await refundBtn.click()
      await page.getByLabel(/Motif du remboursement/i).fill("Certification E2E Hôtel Monde — annulation test")
      await page.getByRole("button", { name: /Confirmer le remboursement/i }).click()
      await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
      await page.screenshot({ path: `${SHOT_DIR}/09-cancellation-refund.png`, fullPage: true })
    })
  })
})
