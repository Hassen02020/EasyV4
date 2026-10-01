import test from "node:test"
import assert from "node:assert/strict"
import { computePriceBreakdown, convertFromTnd, formatMoney, priceDrifted } from "../pricing"

test("pricing: 2 adultes seuls — TVA 19%, acompte 30%", () => {
  const r = computePriceBreakdown({ unitPriceTnd: 100, adults: 2 })
  assert.equal(r.subtotalTnd, 200)
  assert.equal(r.vatTnd, 38)
  assert.equal(r.serviceFeeTnd, 0)
  assert.equal(r.totalTnd, 238)
  assert.equal(r.depositTnd, 71.4)
  assert.equal(r.balanceTnd, 166.6)
})

test("pricing: 2 adultes + 1 enfant — prix enfant = 50% par défaut", () => {
  const r = computePriceBreakdown({
    unitPriceTnd: 200,
    adults: 2,
    children: 1,
  })
  // 2*200 + 1*100 = 500
  assert.equal(r.subtotalTnd, 500)
  // 500 * 0.19 = 95
  assert.equal(r.vatTnd, 95)
  assert.equal(r.totalTnd, 595)
  assert.equal(r.depositTnd, 178.5)
  assert.equal(r.balanceTnd, 416.5)
})

test("pricing: prix enfant explicite", () => {
  const r = computePriceBreakdown({
    unitPriceTnd: 200,
    adults: 2,
    children: 1,
    unitChildPriceTnd: 80,
  })
  // 2*200 + 80 = 480, TVA 91.2, total 571.2
  assert.equal(r.subtotalTnd, 480)
  assert.equal(r.vatTnd, 91.2)
  assert.equal(r.totalTnd, 571.2)
})

test("pricing: frais de service non taxés", () => {
  const r = computePriceBreakdown({
    unitPriceTnd: 100,
    adults: 1,
    serviceFeeTnd: 25,
  })
  // 1*100 + 19 TVA + 25 frais = 144
  assert.equal(r.subtotalTnd, 100)
  assert.equal(r.vatTnd, 19)
  assert.equal(r.serviceFeeTnd, 25)
  assert.equal(r.totalTnd, 144)
})

test("pricing: depositPercent = 0 → acompte 0", () => {
  const r = computePriceBreakdown({
    unitPriceTnd: 100,
    adults: 2,
    depositPercent: 0,
  })
  assert.equal(r.depositTnd, 0)
  assert.equal(r.balanceTnd, r.totalTnd)
})

test("pricing: depositPercent = 100 → solde 0", () => {
  const r = computePriceBreakdown({
    unitPriceTnd: 100,
    adults: 2,
    depositPercent: 100,
  })
  assert.equal(r.depositTnd, r.totalTnd)
  assert.equal(r.balanceTnd, 0)
})

test("pricing: vatRate = 0 → pas de TVA", () => {
  const r = computePriceBreakdown({
    unitPriceTnd: 100,
    adults: 3,
    vatRate: 0,
  })
  assert.equal(r.subtotalTnd, 300)
  assert.equal(r.vatTnd, 0)
  assert.equal(r.totalTnd, 300)
})

test("pricing: rejette adultes < 1", () => {
  assert.throws(() => computePriceBreakdown({ unitPriceTnd: 100, adults: 0 }))
})

test("pricing: rejette prix négatif", () => {
  assert.throws(() => computePriceBreakdown({ unitPriceTnd: -1, adults: 1 }))
})

test("pricing: rejette TVA > 100", () => {
  assert.throws(() =>
    computePriceBreakdown({ unitPriceTnd: 100, adults: 1, vatRate: 120 }),
  )
})

test("pricing: rejette adultes non entier", () => {
  assert.throws(() => computePriceBreakdown({ unitPriceTnd: 100, adults: 1.5 }))
})

test("convertFromTnd: TND → EUR", () => {
  assert.equal(convertFromTnd(340, 3.4), 100)
})

test("convertFromTnd: rate <= 0 → retourne le montant TND", () => {
  assert.equal(convertFromTnd(100, 0), 100)
  assert.equal(convertFromTnd(100, -1), 100)
})

test("formatMoney: 1234.5 TND", () => {
  const s = formatMoney(1234.5, "TND")
  assert.ok(/1\s?234,5/u.test(s))
  assert.ok(s.endsWith("TND"))
})

// --- priceDrifted (CART-DRIFT-01) ---------------------------------------
// Le prix réellement chargé est TOUJOURS recalculé côté serveur (hôtel via
// myGo, package/activité via la ligne DB verrouillée FOR UPDATE) — jamais
// celui affiché au panier. `priceDrifted` est la garde qui décide si ce
// recalcul s'écarte assez de ce que le client a vu/accepté pour justifier
// un rejet (`PRICE_CHANGED`) plutôt qu'une charge silencieuse à un montant
// différent de celui affiché.

test("priceDrifted: aucun montant attendu (chemin non-panier) — jamais de drift", () => {
  assert.equal(priceDrifted(undefined, 238), false)
  assert.equal(priceDrifted(null, 238), false)
})

test("priceDrifted: même montant — pas de drift", () => {
  assert.equal(priceDrifted(238, 238), false)
})

test("priceDrifted: écart d'arrondi flottant (<= 1 centime) — toléré", () => {
  assert.equal(priceDrifted(238, 238.005), false)
  assert.equal(priceDrifted(238.004999, 238, 0.01), false)
})

test("priceDrifted: prix fournisseur réellement changé à la hausse — détecté", () => {
  // Scénario CART-DRIFT-01 : 200 TND affiché au panier, 260 TND recalculé
  // serveur au moment de la confirmation (repricing fournisseur entre-temps).
  assert.equal(priceDrifted(200, 260), true)
})

test("priceDrifted: prix réellement changé à la baisse — aussi détecté (jamais un repli silencieux dans un sens comme dans l'autre)", () => {
  assert.equal(priceDrifted(260, 200), true)
})

test("priceDrifted: tolérance personnalisée respectée", () => {
  assert.equal(priceDrifted(100, 100.5, 1), false)
  assert.equal(priceDrifted(100, 101.5, 1), true)
})
