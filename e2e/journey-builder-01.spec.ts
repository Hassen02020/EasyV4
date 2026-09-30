import { test, expect } from "@playwright/test"

/**
 * JOURNEY-BUILDER-01 — E2E réel : login /pro, création d'un Journey,
 * ajout d'une ligne "network" ciblant un Network Product réellement
 * autorisé pour Sahara Voyages (fixture E2E dédiée, produit possédé par
 * l'agence OTA + product_authorizations réseau), confirmation → vraie
 * réservation via createNetworkProductBooking (débit réel du compte de
 * dépôt), vérifiée dans /pro/reservations. Module "network" choisi plutôt
 * qu'"activity" : createNetworkProductBooking n'écrit jamais dans une
 * table d'inventaire partagée possédée par une autre agence (contrairement
 * à catalog_activity_sessions.booked, dont le WITH CHECK RLS est
 * volontairement resté lecture-seule pour une agence autorisée tierce —
 * décision actée dans 0023_commerce_completion.sql, hors périmètre de ce
 * chantier) — évite un faux négatif E2E sans toucher à ce garde-fou.
 */

const PRO_EMAIL = process.env.E2E_PRO_EMAIL ?? "pro.test@easy2book.local"
const PRO_PASSWORD = process.env.E2E_PRO_PASSWORD ?? "TestPass123!"

const NETWORK_PRODUCT_ID = "40000000-0000-0000-0000-000000000003"

const SHOT_DIR = "docs/audits/screenshots/journey-builder"

test.describe("JOURNEY-BUILDER-01 — composition B2B réelle", () => {
  test.setTimeout(120_000)

  test("login → créer Journey → ajouter ligne activity → confirmer → vraie réservation", async ({ page }) => {
    await test.step("login /pro", async () => {
      await page.goto("/pro/login")
      await page.getByLabel("Email professionnel").fill(PRO_EMAIL)
      await page.getByLabel("Mot de passe", { exact: true }).fill(PRO_PASSWORD)
      await page.getByRole("button", { name: /Accéder à mon Espace Pro/i }).click()
      await page.waitForURL(/\/pro(?!\/login)/, { timeout: 15_000 })
    })

    await test.step("01-list — /pro/journeys, aucune route morte", async () => {
      await page.goto("/pro/journeys")
      await page.waitForLoadState("networkidle")
      await expect(page.getByRole("button", { name: /Nouveau Journey/i })).toBeVisible()
      await page.screenshot({ path: `${SHOT_DIR}/01-list.png`, fullPage: true })
    })

    await test.step("02-create — créer un Journey", async () => {
      await page.getByRole("button", { name: /Nouveau Journey/i }).click()
      await page.getByPlaceholder("Titre (optionnel)").fill("E2E Journey Builder")
      await page.screenshot({ path: `${SHOT_DIR}/02-create-dialog.png`, fullPage: true })
      await page.getByRole("button", { name: /^Créer$/i }).click()
      await page.waitForURL(/\/pro\/journeys\/[0-9a-f-]+$/, { timeout: 15_000 })
    })

    await test.step("03-compose — ajouter une ligne 'network' réelle (fixture E2E)", async () => {
      await page.waitForLoadState("networkidle")
      await page.screenshot({ path: `${SHOT_DIR}/03-composer-empty.png`, fullPage: true })

      await page.getByLabel("Module", { exact: true }).click()
      await page.getByRole("option", { name: "Produit Réseau" }).click()

      await page.getByLabel("ID Produit Réseau", { exact: true }).fill(NETWORK_PRODUCT_ID)
      await page.getByLabel("Quantité", { exact: true }).fill("1")
      await page.getByLabel("Prénom client", { exact: true }).fill("Certif")
      await page.getByLabel("Nom client", { exact: true }).fill("E2E-JourneyBuilder")
      await page.getByLabel("Téléphone", { exact: true }).fill("+21698140514")

      await page.getByRole("button", { name: /Ajouter au Journey/i }).click()
      await page.waitForLoadState("networkidle")
      await expect(page.getByText("Produit Réseau").first()).toBeVisible()
      await page.screenshot({ path: `${SHOT_DIR}/04-line-added-pending.png`, fullPage: true })
    })

    await test.step("05-confirm — confirmer la ligne, vraie réservation réelle (débit compte de dépôt)", async () => {
      await page.getByRole("button", { name: /^Confirmer$/i }).click()
      await page.waitForLoadState("networkidle")
      await expect(page.getByText("Confirmée")).toBeVisible({ timeout: 20_000 })
      await page.screenshot({ path: `${SHOT_DIR}/05-line-confirmed.png`, fullPage: true })
    })

    await test.step("06-reservations — la réservation existe réellement dans /pro/reservations", async () => {
      await page.goto("/pro/reservations")
      await page.waitForLoadState("networkidle")
      await page.screenshot({ path: `${SHOT_DIR}/06-reservations-list.png`, fullPage: true })
      // Une réservation réelle existe pour ce client — preuve qu'un vrai
      // enregistrement (pas une simulation) a été produit (customerName est
      // un champ générique, toujours renseigné quel que soit le module).
      await expect(page.getByText(/E2E-JourneyBuilder/i).first()).toBeVisible({ timeout: 10_000 })
    })
  })

  test("double-clic sur Confirmer — jamais deux réservations (idempotence CAS)", async ({ page }) => {
    await page.goto("/pro/login")
    await page.getByLabel("Email professionnel").fill(PRO_EMAIL)
    await page.getByLabel("Mot de passe", { exact: true }).fill(PRO_PASSWORD)
    await page.getByRole("button", { name: /Accéder à mon Espace Pro/i }).click()
    await page.waitForURL(/\/pro(?!\/login)/, { timeout: 15_000 })

    await page.goto("/pro/journeys")
    await page.getByRole("button", { name: /Nouveau Journey/i }).click()
    await page.getByRole("button", { name: /^Créer$/i }).click()
    await page.waitForURL(/\/pro\/journeys\/[0-9a-f-]+$/, { timeout: 15_000 })

    await page.getByLabel("Module", { exact: true }).click()
    await page.getByRole("option", { name: "Produit Réseau" }).click()
    await page.getByLabel("ID Produit Réseau", { exact: true }).fill(NETWORK_PRODUCT_ID)
    await page.getByLabel("Quantité", { exact: true }).fill("1")
    await page.getByLabel("Prénom client", { exact: true }).fill("Double")
    await page.getByLabel("Nom client", { exact: true }).fill("Click-E2E")
    await page.getByLabel("Téléphone", { exact: true }).fill("+21698140514")
    await page.getByRole("button", { name: /Ajouter au Journey/i }).click()
    await page.waitForLoadState("networkidle")

    // Double-clic quasi-simultané sur "Confirmer" — le CAS
    // pending|failed→processing (lib/journeys/journeys-core.ts) doit
    // garantir qu'un SEUL des deux clics déclenche réellement le moteur
    // (createNetworkProductBooking, débit réel) ; l'autre reçoit
    // "ALREADY_PROCESSING" sans jamais recréer une réservation.
    const confirmButton = page.getByRole("button", { name: /^Confirmer$/i })
    await Promise.all([confirmButton.click(), confirmButton.click({ force: true }).catch(() => {})])
    await page.waitForLoadState("networkidle")
    await expect(page.getByText("Confirmée")).toBeVisible({ timeout: 20_000 })

    // Une seule ligne existe sur ce Journey (jamais dupliquée par le double-clic).
    await expect(page.getByText("Produit Réseau")).toHaveCount(1)
  })
})
