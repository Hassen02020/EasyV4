import { test, expect } from "@playwright/test"
import { addTravelerCookie, draftToken } from "./support/checkout-draft"

/**
 * PHASE21.3 Step 9 — overflow check pour les états checkout/paiement qui
 * exigent un draft réel (`?d=`). Token construit à la main (même schéma que
 * lib/booking/draft-store.ts::encodeDraft) pour atteindre /booking et
 * /booking/travelers (draft seul) et /booking/checkout (draft + traveler)
 * sans dépendre d'un vrai parcours recherche→sélection.
 */

// DRAFT-PII-URL-02 : brouillon SIGNÉ (priceToken valide) — la page de paiement
// affichée est la vraie, pas le bloc « prix non vérifié » — et voyageur dans un
// cookie chiffré, jamais dans l'URL.
const DRAFT = draftToken(true)

const PAGES = [
  { name: "booking-step1-summary", url: `/booking?d=${DRAFT}` },
  { name: "booking-travelers", url: `/booking/travelers?d=${DRAFT}` },
  { name: "booking-checkout-payment", url: "", withTravelerCookie: true },
]

for (const width of [320, 375, 390, 414, 768]) {
  test.describe(`Checkout mobile — overflow @ ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } })
    for (const p of PAGES) {
      test(`${p.name} has no horizontal overflow`, async ({
        page,
        context,
      }) => {
        let url = p.url
        if ("withTravelerCookie" in p && p.withTravelerCookie) {
          const ref = await addTravelerCookie(context)
          url = `/booking/checkout?d=${DRAFT}&t=${ref}`
        }
        await page.goto(url, { waitUntil: "networkidle" })
        // Le test doit atteindre la PAGE visée : une redirection (cookie refusé,
        // brouillon rejeté) ne doit pas passer pour un « pas de débordement ».
        const expectedPath = p.name.startsWith("booking-checkout")
          ? "/booking/checkout"
          : p.name.startsWith("booking-travelers")
            ? "/booking/travelers"
            : "/booking"
        expect(page.url()).toContain(expectedPath)
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        expect(
          overflow.scrollWidth,
          `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth} on ${url}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
      })
    }
  })
}
