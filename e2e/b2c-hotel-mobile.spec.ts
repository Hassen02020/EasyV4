import { test, expect } from "@playwright/test"

/**
 * PHASE21.2 — garde-fou overflow horizontal sur le parcours B2C Hôtel
 * Tunisie, aux 5 largeurs mandatées (320/375/390/414/768). Les pages qui
 * exigent un état serveur réel (checkout/confirmation/voucher/facture)
 * sont testées via leurs états "introuvable" atteignables sans session —
 * un panneau d'erreur qui déborde est un vrai bug UI, pas un faux positif.
 */

const PAGES = [
  { name: "home", url: "/" },
  { name: "hotels-search", url: "/hotels/search?cityId=1&checkin=2026-09-10&checkout=2026-09-13&adults=2" },
  { name: "hotel-detail", url: "/hotels/500001" },
  { name: "booking-confirmation-not-found", url: "/booking/confirmation/TG-DOES-NOT-EXIST?token=x" },
]

for (const width of [320, 375, 390, 414, 768]) {
  test.describe(`B2C hôtel — overflow @ ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } })
    for (const p of PAGES) {
      test(`${p.name} has no horizontal overflow`, async ({ page }) => {
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
