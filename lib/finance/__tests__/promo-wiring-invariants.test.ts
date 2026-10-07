/**
 * PROMO-PRICING-COVERAGE-01 — invariants statiques de couverture du câblage
 * promo dans les 8 pipelines de réservation B2C guest checkout.
 *
 * Vérifie sur le code source réel (readFileSync) que chaque module importe
 * `resolveCheckoutPromoCore`/`applyPromoDiscountCore` et les appelle bien
 * — même patron que `commission-wiring-invariants.test.ts`, pour empêcher
 * qu'un futur module de réservation B2C soit ajouté sans câblage promo
 * (ou qu'un câblage existant soit silencieusement retiré) sans qu'un test
 * échoue. Les chemins B2B (actions.ts/booking-actions.ts côté partenaire)
 * sont hors scope : promo cible le client final via un contact réel
 * (CONTACT-01), jamais une agence partenaire — confirmé par audit, aucun
 * chemin B2B du dépôt n'appelle ces fonctions.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
}

const PROMO_WIRED_FILES: Array<{ label: string; path: string }> = [
  {
    label: "booking/guest-actions.ts (Hôtel TN)",
    path: "lib/booking/guest-actions.ts",
  },
  {
    label: "packages/booking-actions.ts",
    path: "lib/packages/booking-actions.ts",
  },
  {
    label: "omra/guest-booking-actions.ts",
    path: "lib/omra/guest-booking-actions.ts",
  },
  {
    label: "transfers/guest-booking-actions.ts",
    path: "lib/transfers/guest-booking-actions.ts",
  },
  {
    label: "hotels-monde/guest-booking-actions.ts",
    path: "lib/hotels-monde/guest-booking-actions.ts",
  },
  {
    label: "activities/guest-booking-actions.ts",
    path: "lib/activities/guest-booking-actions.ts",
  },
  {
    label: "cars/guest-booking-actions.ts",
    path: "lib/cars/guest-booking-actions.ts",
  },
  {
    label: "vols/booking-request-action.ts",
    path: "lib/vols/booking-request-action.ts",
  },
]

for (const { label, path } of PROMO_WIRED_FILES) {
  const src = read(path)

  test(`PROMO-PRICING-COVERAGE-01 — ${label} : importe resolveCheckoutPromoCore`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*resolveCheckoutPromoCore[^}]*\}\s*from\s*["']@\/lib\/crm\/promo-checkout-core["']/,
      `${label} doit importer resolveCheckoutPromoCore depuis lib/crm/promo-checkout-core`,
    )
  })

  test(`PROMO-PRICING-COVERAGE-01 — ${label} : importe applyPromoDiscountCore`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*applyPromoDiscountCore[^}]*\}\s*from\s*["']@\/lib\/finance\/promo-discount-core["']/,
      `${label} doit importer applyPromoDiscountCore depuis lib/finance/promo-discount-core`,
    )
  })

  test(`PROMO-PRICING-COVERAGE-01 — ${label} : appelle resolveCheckoutPromoCore(tx, ...)`, () => {
    assert.match(
      src,
      /resolveCheckoutPromoCore\(\s*tx,/,
      `${label} doit appeler resolveCheckoutPromoCore(tx, {...})`,
    )
  })

  test(`PROMO-PRICING-COVERAGE-01 — ${label} : appelle applyPromoDiscountCore`, () => {
    assert.match(
      src,
      /applyPromoDiscountCore\(/,
      `${label} doit appeler applyPromoDiscountCore(...)`,
    )
  })
}

/* -------------------------------------------------------------------------- */
/* PROMO-LOSS-POLICY-01 — plancher coût fournisseur sur les modules à coût    */
/* externe réel (hôtels monde, vols) ; omis ailleurs (pas de coût séparé)      */
/* -------------------------------------------------------------------------- */

test("hotels-monde/guest-booking-actions.ts : applyPromoDiscountCore passe supplierPriceTnd (plancher coût fournisseur réel)", () => {
  const src = read("lib/hotels-monde/guest-booking-actions.ts")
  const call = src.match(/applyPromoDiscountCore\(([\s\S]*?)\)\.finalPriceTnd/)
  assert.ok(call, "applyPromoDiscountCore doit être appelé")
  assert.match(
    call![1]!,
    /supplierPriceTnd:/,
    "hotels-monde doit passer supplierPriceTnd à applyPromoDiscountCore (coût fournisseur externe réel)",
  )
})

test("vols/booking-request-action.ts : applyPromoDiscountCore passe supplierPriceTnd (plancher coût fournisseur réel)", () => {
  const src = read("lib/vols/booking-request-action.ts")
  const call = src.match(/applyPromoDiscountCore\(([\s\S]*?)\)\.finalPriceTnd/)
  assert.ok(call, "applyPromoDiscountCore doit être appelé")
  assert.match(
    call![1]!,
    /supplierPriceTnd:/,
    "vols doit passer supplierPriceTnd à applyPromoDiscountCore (coût fournisseur externe réel)",
  )
})

test("cars/guest-booking-actions.ts : applyPromoDiscountCore N'A PAS de plancher (pas de coût fournisseur externe — catalogue agence)", () => {
  const src = read("lib/cars/guest-booking-actions.ts")
  const call = src.match(/applyPromoDiscountCore\(([\s\S]*?)\)\.finalPriceTnd/)
  assert.ok(call, "applyPromoDiscountCore doit être appelé")
  assert.doesNotMatch(
    call![1]!,
    /supplierPriceTnd/,
    "cars ne doit pas passer supplierPriceTnd (pas de coût fournisseur externe réel)",
  )
})
