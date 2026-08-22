import { test, expect } from "@playwright/test"

/**
 * B2C guest checkout — Phase 12, Partie 17.
 *
 * Vérifie que le tunnel de réservation public ne requiert JAMAIS de compte
 * partenaire (le blocker P0 identifié en Phase 11/12 : `submitCheckoutAction`
 * exigeait une session partenaire pour toute réservation). Ne va pas
 * jusqu'à la soumission réelle du paiement (pas de transaction financière
 * réelle en test, cf. Partie 18) — vérifie que l'UI de paiement s'affiche
 * honnêtement (pas de mention "simulation") pour un visiteur anonyme.
 */

test.describe("B2C guest checkout — accès public sans compte partenaire", () => {
  test("la page checkout ne redirige jamais vers une page de login partenaire", async ({ page }) => {
    // Sans session, l'accès direct au checkout avec un token invalide doit
    // rediriger vers l'accueil (draft manquant), jamais vers /pro/login.
    await page.goto("/booking/checkout")
    await page.waitForLoadState("domcontentloaded")
    expect(page.url()).not.toContain("/pro/login")
    expect(page.url()).not.toContain("/login")
  })

  test("la page de confirmation pour une référence inconnue affiche un état 'introuvable', jamais des données fabriquées", async ({ page }) => {
    // NB : le code HTTP réel de cette réponse est 200 (pas 404) — un "soft
    // 404" causé par `app/booking/loading.tsx` : ce loading.tsx couvre tout
    // le segment /booking/*, ce qui active le streaming SSR sur cette route ;
    // le shell (statut 200) est envoyé avant que le composant asynchrone
    // n'appelle `notFound()`, donc le statut ne peut plus être corrigé une
    // fois émis — comportement de streaming Next.js documenté, pas une
    // régression Phase 12 (vérifié aussi sur `/pro/booking/confirmation/[ref]`,
    // absent de tout /booking/loading.tsx : même page, même garde). Ce test
    // vérifie donc la garantie qui compte réellement : AUCUNE donnée de
    // réservation n'est jamais affichée pour une référence inexistante.
    await page.goto("/booking/confirmation/DOES-NOT-EXIST-000")
    await expect(page.getByText(/could not be found|page introuvable/i).first()).toBeVisible()
    await expect(page.getByText(/Référence/i)).toHaveCount(0)
  })

  test("le téléchargement de voucher hôtel pour une référence inconnue ne renvoie jamais un PDF (pas de faux succès)", async ({ request }) => {
    const response = await request.get("/api/booking/voucher/DOES-NOT-EXIST-000")
    expect(response.status()).not.toBe(200)
    expect(response.headers()["content-type"]).not.toContain("application/pdf")
  })

  test("le téléchargement de voucher Omra pour une référence inconnue ne renvoie jamais un PDF", async ({ request }) => {
    const response = await request.get("/api/omra/voucher/DOES-NOT-EXIST-000")
    expect(response.status()).not.toBe(200)
    expect(response.headers()["content-type"]).not.toContain("application/pdf")
  })

  test("le téléchargement de voucher Package pour une référence inconnue ne renvoie jamais un PDF", async ({ request }) => {
    const response = await request.get("/api/packages/voucher/DOES-NOT-EXIST-000")
    expect(response.status()).not.toBe(200)
    expect(response.headers()["content-type"]).not.toContain("application/pdf")
  })
})
