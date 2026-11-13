import { test, expect } from "@playwright/test"
import {
  newTravelerRef,
  sealTraveler,
  travelerCookieName,
} from "../lib/booking/traveler-cookie"

const TRAVELER_REF = newTravelerRef()
const TRAVELER = {
  civility: "M" as const,
  firstName: "Sami",
  lastName: "Test",
  email: "sami-mobile-test@example.com",
  phone: "+216 98 123 456",
  civicIdType: "cin" as const,
  civicId: "12345678",
}

/**
 * PHASE21.3 Step 9 — overflow check pour les états checkout/paiement qui
 * exigent un draft réel (`?d=`). Token construit à la main (même schéma que
 * lib/booking/draft-store.ts::encodeDraft) pour atteindre /booking et
 * /booking/travelers (draft seul) et /booking/checkout (draft + traveler)
 * sans dépendre d'un vrai parcours recherche→sélection.
 */

const DRAFT_ONLY =
  "eyJkcmFmdCI6eyJtb2R1bGUiOiJob3RlbCIsIm9mZmVySWQiOiI1MDAwMDEtMS0xIiwib2ZmZXJMYWJlbCI6IkjDtHRlbCBUZXN0IE1vYmlsZSDigJQgQ2hhbWJyZSBEb3VibGUiLCJzdGFydERhdGUiOiIyMDI2LTA5LTEwIiwiZW5kRGF0ZSI6IjIwMjYtMDktMTMiLCJhZHVsdHMiOjIsImNoaWxkcmVuIjowLCJ1bml0UHJpY2VUbmQiOjI1MCwiY3VycmVuY3kiOiJUTkQiLCJtZXRhZGF0YSI6eyJob3RlbElkIjo1MDAwMDEsImNpdHlJZCI6MSwiYm9hcmRpbmdJZCI6MSwicm9vbUlkIjoxLCJteUdvVG9rZW4iOiJkdW1teS10b2tlbiJ9fX0"

const PAGES = [
  { name: "booking-step1-summary", url: `/booking?d=${DRAFT_ONLY}` },
  { name: "booking-travelers", url: `/booking/travelers?d=${DRAFT_ONLY}` },
  {
    // DRAFT-PII-URL-02 : le voyageur n'est plus dans l'URL — cookie chiffré
    // posé avant la navigation (même clé dérivée de PRICE_TOKEN_SECRET).
    name: "booking-checkout-payment",
    url: `/booking/checkout?d=${DRAFT_ONLY}&t=${TRAVELER_REF}`,
    withTravelerCookie: true,
  },
]

for (const width of [320, 375, 390, 414, 768]) {
  test.describe(`Checkout mobile — overflow @ ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } })
    for (const p of PAGES) {
      test(`${p.name} has no horizontal overflow`, async ({
        page,
        context,
      }) => {
        if ("withTravelerCookie" in p && p.withTravelerCookie) {
          await context.addCookies([
            {
              name: travelerCookieName(TRAVELER_REF),
              value: sealTraveler(TRAVELER_REF, TRAVELER),
              url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
            },
          ])
        }
        await page.goto(p.url, { waitUntil: "networkidle" })
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        expect(
          overflow.scrollWidth,
          `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth} on ${p.url}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
      })
    }
  })
}
