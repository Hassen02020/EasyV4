import { test, expect } from "@playwright/test"

/**
 * PHASE21.3 Step 9 — overflow check pour les états checkout/paiement qui
 * exigent un draft réel (`?d=`). Token construit à la main (même schéma que
 * lib/booking/draft-store.ts::encodeDraft) pour atteindre /booking et
 * /booking/travelers (draft seul) et /booking/checkout (draft + traveler)
 * sans dépendre d'un vrai parcours recherche→sélection.
 */

const DRAFT_ONLY =
  "eyJkcmFmdCI6eyJtb2R1bGUiOiJob3RlbCIsIm9mZmVySWQiOiI1MDAwMDEtMS0xIiwib2ZmZXJMYWJlbCI6IkjDtHRlbCBUZXN0IE1vYmlsZSDigJQgQ2hhbWJyZSBEb3VibGUiLCJzdGFydERhdGUiOiIyMDI2LTA5LTEwIiwiZW5kRGF0ZSI6IjIwMjYtMDktMTMiLCJhZHVsdHMiOjIsImNoaWxkcmVuIjowLCJ1bml0UHJpY2VUbmQiOjI1MCwiY3VycmVuY3kiOiJUTkQiLCJtZXRhZGF0YSI6eyJob3RlbElkIjo1MDAwMDEsImNpdHlJZCI6MSwiYm9hcmRpbmdJZCI6MSwicm9vbUlkIjoxLCJteUdvVG9rZW4iOiJkdW1teS10b2tlbiJ9fX0"
const WITH_TRAVELER =
  "eyJkcmFmdCI6eyJtb2R1bGUiOiJob3RlbCIsIm9mZmVySWQiOiI1MDAwMDEtMS0xIiwib2ZmZXJMYWJlbCI6IkjDtHRlbCBUZXN0IE1vYmlsZSDigJQgQ2hhbWJyZSBEb3VibGUiLCJzdGFydERhdGUiOiIyMDI2LTA5LTEwIiwiZW5kRGF0ZSI6IjIwMjYtMDktMTMiLCJhZHVsdHMiOjIsImNoaWxkcmVuIjowLCJ1bml0UHJpY2VUbmQiOjI1MCwiY3VycmVuY3kiOiJUTkQiLCJtZXRhZGF0YSI6eyJob3RlbElkIjo1MDAwMDEsImNpdHlJZCI6MSwiYm9hcmRpbmdJZCI6MSwicm9vbUlkIjoxLCJteUdvVG9rZW4iOiJkdW1teS10b2tlbiJ9fSwidHJhdmVsZXIiOnsiY2l2aWxpdHkiOiJNIiwiZmlyc3ROYW1lIjoiU2FtaSIsImxhc3ROYW1lIjoiVGVzdCIsImVtYWlsIjoic2FtaS1tb2JpbGUtdGVzdEBleGFtcGxlLmNvbSIsInBob25lIjoiKzIxNiA5OCAxMjMgNDU2IiwiY2l2aWNJZFR5cGUiOiJjaW4iLCJjaXZpY0lkIjoiMTIzNDU2NzgifX0"

const PAGES = [
  { name: "booking-step1-summary", url: `/booking?d=${DRAFT_ONLY}` },
  { name: "booking-travelers", url: `/booking/travelers?d=${DRAFT_ONLY}` },
  { name: "booking-checkout-payment", url: `/booking/checkout?d=${WITH_TRAVELER}` },
]

for (const width of [320, 375, 390, 414, 768]) {
  test.describe(`Checkout mobile — overflow @ ${width}px`, () => {
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
