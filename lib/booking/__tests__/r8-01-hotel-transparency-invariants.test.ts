/**
 * R8-01 — Invariants statiques : transparence tarifaire hôtel
 *
 * Ces tests vérifient que les données d'annulation sont bien transmises
 * depuis les deux points d'entrée hôtel jusqu'à l'affichage checkout,
 * et que le label "TTC" n'apparaît pas sur la carte SERP hôtel (prix HT).
 *
 * Tests intentionnellement robustes au formatage automatique (pas de snapshot,
 * pas de regex dépendant de l'indentation).
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import assert from "node:assert/strict"

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8")
}

describe("R8-01 — Transparence tarifaire hôtel", () => {
  describe("SERP hotel-listings.tsx — prix HT, pas de label TTC", () => {
    it("ne contient pas la chaîne « TTC » dans hotel-listings.tsx", () => {
      const src = read("components/hotel-listings.tsx")
      assert.ok(
        !src.includes("TTC"),
        "hotel-listings.tsx ne doit pas afficher «TTC» car le prix est HT (TVA ajoutée au checkout)",
      )
    })

    it("transmet hasFreeCancellation dans le draft metadata (handleBookHotel)", () => {
      const src = read("components/hotel-listings.tsx")
      assert.ok(
        src.includes("hasFreeCancellation"),
        "hotel-listings.tsx doit inclure hasFreeCancellation dans le draft metadata",
      )
    })

    it("transmet freeCancellationDate dans le draft metadata (handleBookHotel)", () => {
      const src = read("components/hotel-listings.tsx")
      assert.ok(
        src.includes("freeCancellationDate"),
        "hotel-listings.tsx doit inclure freeCancellationDate dans le draft metadata",
      )
    })

    it("utilise la clé i18n nightsFromPrice quand les nuits sont disponibles", () => {
      const src = read("components/hotel-card.tsx")
      assert.ok(
        src.includes("nightsFromPrice"),
        "hotel-card.tsx doit utiliser la clé nightsFromPrice pour les séjours datés",
      )
    })
  })

  describe("Page détail hôtel — transmission données d'annulation", () => {
    it("transmet hasFreeCancellation depuis la page détail hôtel", () => {
      const src = read("app/(public)/[locale]/hotels/[id]/page.tsx")
      assert.ok(
        src.includes("hasFreeCancellation"),
        "hotels/[id]/page.tsx doit inclure hasFreeCancellation dans le draft metadata",
      )
    })

    it("transmet freeCancellationDate depuis la page détail hôtel", () => {
      const src = read("app/(public)/[locale]/hotels/[id]/page.tsx")
      assert.ok(
        src.includes("freeCancellationDate"),
        "hotels/[id]/page.tsx doit inclure freeCancellationDate dans le draft metadata",
      )
    })
  })

  describe("Checkout — CancellationPolicyDisplay réutilisé", () => {
    it("importe CancellationPolicyDisplay dans checkout/page.tsx", () => {
      const src = read("app/(public)/[locale]/booking/checkout/page.tsx")
      assert.ok(
        src.includes("CancellationPolicyDisplay"),
        "checkout/page.tsx doit importer CancellationPolicyDisplay",
      )
    })

    it("utilise hotelCancellation prop dans checkout/page.tsx", () => {
      const src = read("app/(public)/[locale]/booking/checkout/page.tsx")
      assert.ok(
        src.includes("hotelCancellation"),
        "checkout/page.tsx doit passer hotelCancellation à CancellationPolicyDisplay",
      )
    })

    it("ne contient pas de badge ShieldCheck inline autonome dans checkout", () => {
      const src = read("app/(public)/[locale]/booking/checkout/page.tsx")
      // Il ne doit pas y avoir de bg-emerald-50 inline (ancien badge rejeté)
      assert.ok(
        !src.includes("bg-emerald-50"),
        "checkout/page.tsx ne doit pas contenir de badge ShieldCheck inline (remplacé par CancellationPolicyDisplay)",
      )
    })
  })

  describe("CancellationPolicyDisplay — prop hotelCancellation disponible", () => {
    it("expose la prop hotelCancellation", () => {
      const src = read("components/booking/cancellation-policy-display.tsx")
      assert.ok(
        src.includes("hotelCancellation"),
        "CancellationPolicyDisplay doit accepter la prop hotelCancellation",
      )
    })

    it("utilise freeCancellationUntilLabel i18n quand la date est fournie", () => {
      const src = read("components/booking/cancellation-policy-display.tsx")
      assert.ok(
        src.includes("freeCancellationUntilLabel"),
        "CancellationPolicyDisplay doit utiliser la clé i18n freeCancellationUntilLabel",
      )
    })
  })

  describe("i18n — clés R8-01 présentes dans les 3 locales", () => {
    const locales = ["fr", "en", "ar"] as const
    const keys = [
      "Hotels.nightsFromPrice",
      "Booking.freeCancellationAvailable",
      "Booking.freeCancellationUntilLabel",
    ]

    for (const locale of locales) {
      for (const key of keys) {
        it(`[${locale}] contient la clé ${key}`, () => {
          const src = read(`messages/${locale}.json`)
          const [namespace, k] = key.split(".")
          const parsed = JSON.parse(src) as Record<
            string,
            Record<string, string>
          >
          assert.ok(
            parsed[namespace]?.[k] !== undefined,
            `messages/${locale}.json doit contenir ${key}`,
          )
        })
      }
    }
  })
})
