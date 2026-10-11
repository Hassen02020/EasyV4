/**
 * R8-02 — Invariants statiques : acceptation politique d'annulation Hôtels Monde
 *
 * REFUND-POLICY-01b — vérifie que le tunnel Hôtels Monde (world-hotel-guest-booking-form)
 * exige l'acceptation explicite de la politique d'annulation avant soumission,
 * et que les clés i18n nécessaires sont présentes dans les 3 locales.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import assert from "node:assert/strict"

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8")
}

describe("R8-02 — Politique d'annulation Hôtels Monde", () => {
  describe("world-hotel-guest-booking-form.tsx — gate policyAccepted", () => {
    it("contient l'état policyAccepted", () => {
      const src = read(
        "components/hotels-monde/world-hotel-guest-booking-form.tsx",
      )
      assert.ok(
        src.includes("policyAccepted"),
        "world-hotel-guest-booking-form.tsx doit gérer l'état policyAccepted",
      )
    })

    it("bloque la soumission si policyAccepted est false", () => {
      const src = read(
        "components/hotels-monde/world-hotel-guest-booking-form.tsx",
      )
      assert.ok(
        src.includes("mustAcceptCancellationPolicy"),
        "world-hotel-guest-booking-form.tsx doit afficher mustAcceptCancellationPolicy si non accepté",
      )
    })

    it("le bouton submit est désactivé sans policyAccepted", () => {
      const src = read(
        "components/hotels-monde/world-hotel-guest-booking-form.tsx",
      )
      assert.ok(
        src.includes("!policyAccepted"),
        "le bouton submit doit être disabled quand policyAccepted est false",
      )
    })

    it("utilise ShieldCheck et ShieldX pour la carte politique", () => {
      const src = read(
        "components/hotels-monde/world-hotel-guest-booking-form.tsx",
      )
      assert.ok(
        src.includes("ShieldCheck") && src.includes("ShieldX"),
        "world-hotel-guest-booking-form.tsx doit importer ShieldCheck et ShieldX",
      )
    })

    it("affiche cancellationPolicyTitle", () => {
      const src = read(
        "components/hotels-monde/world-hotel-guest-booking-form.tsx",
      )
      assert.ok(
        src.includes("cancellationPolicyTitle"),
        "world-hotel-guest-booking-form.tsx doit utiliser la clé cancellationPolicyTitle",
      )
    })
  })

  describe("i18n — clés R8-02 présentes dans les 3 locales", () => {
    const locales = ["fr", "en", "ar"] as const
    const keys = [
      "HotelsMonde.cancellationPolicyTitle",
      "HotelsMonde.cancellationFree",
      "HotelsMonde.cancellationNonRefundable",
      "HotelsMonde.acceptCancellationPolicy",
      "HotelsMonde.mustAcceptCancellationPolicy",
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
