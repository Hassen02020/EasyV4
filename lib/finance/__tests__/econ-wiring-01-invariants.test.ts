/**
 * ECON-WIRING-01 — invariants statiques sur le câblage additif de
 * `economic_entitlements` (ECON-BREAKDOWN-01) dans les 8 modules qui
 * n'étaient pas encore câblés (Hotel TN, Car, Transfer, Hotels-Monde,
 * Vols, Omra, Activities, Packages) — Network était déjà câblé et couvert
 * par lib/network/__tests__/product-booking-actions-invariants.test.ts.
 *
 * "use server" empêche de charger ces fichiers sous `node --test` hors
 * bundler Next.js — vérification statique sur le code source réel, même
 * convention que les autres invariants financiers du dépôt.
 *
 * Règle Direction appliquée partout ci-dessous (2026-10) :
 *  - product_owner ≠ external_supplier : un module dont le "coût" vient
 *    d'un catalogue PROPRE à l'agence (car_pricing_rates, transfer rates,
 *    omra_packages, catalog_packages, catalog_activities — tous
 *    `agency_id` FK) attribue sa ligne de coût à role="product_owner",
 *    partyType="agency", jamais "external_supplier".
 *  - Pas de ligne fabriquée à 0 : un module sans commission réelle
 *    aujourd'hui n'a jamais de ligne qualification="commission" dans son
 *    call site ; un module sans marge réelle (supplierPriceTnd ===
 *    salePriceTnd) n'a qu'UNE seule ligne product_owner, jamais de lignes
 *    seller_margin/commission à 0.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/* -------------------------------------------------------------------------- */
/* Hotel TN — fournisseur externe réel (myGo), commission réelle              */
/* -------------------------------------------------------------------------- */

for (const [label, path] of [
  ["booking/actions.ts (front-office)", "lib/booking/actions.ts"],
  ["booking/guest-actions.ts (B2C)", "lib/booking/guest-actions.ts"],
] as const) {
  test(`Hotel TN — ${label} : 3 lignes (external_supplier/agency-seller/easy2book), commission réelle non fabriquée`, () => {
    const src = read(path)
    assert.match(
      src,
      /partyType: "external_supplier",\s*\n\s*partyId: null,\s*\n\s*role: "supplier",\s*\n\s*qualification: "supplier_cost",/,
    )
    assert.match(src, /role: "seller",\s*\n\s*qualification: "seller_margin",/)
    assert.match(src, /role: "easy2book",\s*\n\s*qualification: "commission",/)
    // Commission réelle = même formule textuelle que recordReservationFinancials()
    assert.match(
      src,
      /Math\.round\(\s*\n?\s*marginAmountTnd \* \(commissionRateForEntitlements \/ 100\) \* 100,?\s*\n?\s*\) \/ 100/,
    )
  })
}

/* -------------------------------------------------------------------------- */
/* Car / Transfer — catalogue propre à l'agence, marge réelle, 0 commission   */
/* -------------------------------------------------------------------------- */

for (const [label, path, costVar] of [
  ["cars/actions.ts (B2B)", "lib/cars/actions.ts", "carSupplierCostTnd"],
  [
    "cars/guest-booking-actions.ts (B2C)",
    "lib/cars/guest-booking-actions.ts",
    "carSupplierCostTnd",
  ],
  [
    "transfers/actions.ts",
    "lib/transfers/actions.ts",
    "transferSupplierCostTnd",
  ],
] as const) {
  test(`Car/Transfer — ${label} : 2 lignes (agency product_owner + agency seller), pas de ligne commission fabriquée`, () => {
    const src = read(path)
    assert.match(
      src,
      /role: "product_owner",\s*\n\s*qualification: "supplier_cost",/,
    )
    assert.match(src, /role: "seller",\s*\n\s*qualification: "seller_margin",/)
    assert.equal(
      src.includes('qualification: "commission"'),
      false,
      "aucune commission réelle sur ce module aujourd'hui — pas de ligne fabriquée",
    )
    // Σ = coût + (vente - coût) = vente : les deux montants réutilisent la
    // même variable que supplierPriceTnd, jamais un second calcul.
    assert.equal(countOccurrences(src, `amount: ${costVar},`), 1)
  })
}

/* -------------------------------------------------------------------------- */
/* Hotels-Monde / Vols — fournisseur externe réel, 0 commission aujourd'hui   */
/* -------------------------------------------------------------------------- */

for (const [label, path] of [
  [
    "hotels-monde/guest-booking-actions.ts",
    "lib/hotels-monde/guest-booking-actions.ts",
  ],
  ["vols/guest-booking-actions.ts", "lib/vols/guest-booking-actions.ts"],
] as const) {
  test(`Hotels-Monde/Vols — ${label} : 2 lignes (external_supplier + agency seller), pas de commission fabriquée`, () => {
    const src = read(path)
    assert.match(
      src,
      /partyType: "external_supplier",\s*\n\s*partyId: null,\s*\n\s*role: "supplier",\s*\n\s*qualification: "supplier_cost",/,
    )
    assert.match(src, /role: "seller",\s*\n\s*qualification: "seller_margin",/)
    assert.equal(src.includes('qualification: "commission"'), false)
  })
}

test("vols/flight-financials.ts : 2 lignes conditionnées à la résolution réelle de agencyId (pas de ligne si la réservation est introuvable)", () => {
  const src = read("lib/vols/flight-financials.ts")
  assert.match(
    src,
    /partyType: "external_supplier",\s*\n\s*partyId: null,\s*\n\s*role: "supplier",\s*\n\s*qualification: "supplier_cost",/,
  )
  assert.match(src, /role: "seller",\s*\n\s*qualification: "seller_margin",/)
  assert.equal(src.includes('qualification: "commission"'), false)
  assert.match(src, /economicEntitlements: reservation\s*\n\s*\? \[/)
})

/* -------------------------------------------------------------------------- */
/* Omra / Activities / Packages — aucune marge aujourd'hui, 1 seule ligne     */
/* -------------------------------------------------------------------------- */

for (const [label, path, count] of [
  ["omra/booking-actions.ts", "lib/omra/booking-actions.ts", 1],
  ["omra/guest-booking-actions.ts", "lib/omra/guest-booking-actions.ts", 1],
  ["activities/booking-actions.ts", "lib/activities/booking-actions.ts", 1],
  [
    "activities/guest-booking-actions.ts",
    "lib/activities/guest-booking-actions.ts",
    1,
  ],
  ["packages/booking-actions.ts", "lib/packages/booking-actions.ts", 2],
] as const) {
  test(`Omra/Activities/Packages — ${label} : UNE seule ligne product_owner=agence par call site, pas de seller_margin/commission fabriqués à 0`, () => {
    const src = read(path)
    const matches =
      src.match(
        /role: "product_owner",\s*\n\s*qualification: "owner_share",/g,
      ) ?? []
    assert.equal(matches.length, count)
    assert.equal(src.includes('qualification: "seller_margin"'), false)
    assert.equal(src.includes('qualification: "commission"'), false)
    assert.equal(src.includes('partyType: "external_supplier"'), false)
  })
}

/* -------------------------------------------------------------------------- */
/* Non-régression — aucune modification du calcul de prix/commission/wallet   */
/* -------------------------------------------------------------------------- */

test("aucun des fichiers câblés ne modifie applyMargin/getMarginsForAgency/creditPlatformCommission/debitPartnerCredit — wiring additif uniquement", () => {
  const files = [
    "lib/booking/actions.ts",
    "lib/booking/guest-actions.ts",
    "lib/cars/actions.ts",
    "lib/cars/guest-booking-actions.ts",
    "lib/transfers/actions.ts",
    "lib/hotels-monde/guest-booking-actions.ts",
    "lib/vols/guest-booking-actions.ts",
    "lib/vols/flight-financials.ts",
    "lib/omra/booking-actions.ts",
    "lib/omra/guest-booking-actions.ts",
    "lib/activities/booking-actions.ts",
    "lib/activities/guest-booking-actions.ts",
    "lib/packages/booking-actions.ts",
  ]
  for (const f of files) {
    const src = read(f)
    // Le bloc economicEntitlements (entre `economicEntitlements: [` et son
    // `],` de fermeture) ne doit jamais invoquer un moteur de calcul — les
    // montants réutilisent uniquement des variables déjà calculées plus
    // haut dans la même fonction, jamais un second appel.
    const blockStart = src.indexOf("economicEntitlements:")
    if (blockStart === -1) continue
    const blockEnd = src.indexOf("],", blockStart)
    const block = src.slice(blockStart, blockEnd)
    assert.equal(
      block.includes("applyMargin("),
      false,
      `${f} : le bloc economicEntitlements ne doit pas appeler applyMargin()`,
    )
    assert.equal(
      block.includes("getMarginsForAgency("),
      false,
      `${f} : le bloc economicEntitlements ne doit pas appeler getMarginsForAgency()`,
    )
  }
})
