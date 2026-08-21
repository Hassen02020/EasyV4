import { test, expect } from "@playwright/test"

/**
 * Garde-fou overflow horizontal — 390px (mobile) et 1440px (desktop) sur
 * les pages d'entrée/résultats des modules réservation. Un `scrollWidth`
 * qui dépasse `clientWidth` révèle un élément qui déborde de l'écran
 * (souvent une card, un tableau ou une grille qui ignore le viewport
 * mobile) avant même de devoir comparer des captures d'écran à l'œil.
 */

const PAGES = [
  { name: "home", url: "/" },
  { name: "hotels-tunisie-search", url: "/hotels/search?cityId=1&checkin=2026-09-10&checkout=2026-09-13&adults=2" },
  { name: "hotels-monde", url: "/hotels-monde" },
  { name: "hotels-monde-search", url: "/hotels-monde/search?destination=paris&checkIn=2026-09-10&checkOut=2026-09-13&adults=2&rooms=1" },
  { name: "vols", url: "/vols" },
  { name: "vols-search", url: "/vols/search?origin=TUN&destination=IST&departureDate=2026-09-10&adults=1&cabin=ECONOMY" },
  { name: "car", url: "/car" },
]

for (const width of [390, 1440]) {
  test.describe(`Overflow check @ ${width}px`, () => {
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
