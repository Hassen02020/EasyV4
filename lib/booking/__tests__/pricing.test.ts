import test from "node:test"
import assert from "node:assert/strict"
import {
  computePriceBreakdown,
  convertFromTnd,
  formatMoney,
  priceDrifted,
} from "../pricing"

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

// --- PRICING-VATRULE-01 : vatRate dynamique (non-19) ------------------
// Ces tests vérifient que computePriceBreakdown calcule correctement HT,
// TVA et TTC pour des taux autres que le défaut 19 % — notamment 7 %.
// Convention auditée : unitPriceTnd est toujours HT. La TVA est appliquée
// UNE SEULE FOIS sur la base HT. Pas de double-TVA.

test("pricing: vatRate=7 — 2 adultes, HT/TVA/TTC exacts", () => {
  // Base HT : 2 × 100 = 200. TVA 7 % : 14. TTC : 214.
  const r = computePriceBreakdown({
    unitPriceTnd: 100,
    adults: 2,
    vatRate: 7,
  })
  assert.equal(r.subtotalTnd, 200)
  assert.equal(r.vatTnd, 14)
  assert.equal(r.totalTnd, 214)
  assert.equal(r.depositTnd, 64.2) // 214 × 30 % = 64.2
  assert.equal(r.balanceTnd, 149.8) // 214 − 64.2
})

test("pricing: vatRate=7 — 2 adultes + 1 enfant avec prix explicite", () => {
  // Base HT : 2 × 200 + 80 = 480. TVA 7 % : 33.6. TTC : 513.6.
  const r = computePriceBreakdown({
    unitPriceTnd: 200,
    adults: 2,
    children: 1,
    unitChildPriceTnd: 80,
    vatRate: 7,
  })
  assert.equal(r.subtotalTnd, 480)
  assert.equal(r.vatTnd, 33.6)
  assert.equal(r.totalTnd, 513.6)
})

test("pricing: vatRate=7 — enfant par défaut (50 % de l'adulte)", () => {
  // Base HT : 2 × 300 + 150 = 750. TVA 7 % : 52.5. TTC : 802.5.
  const r = computePriceBreakdown({
    unitPriceTnd: 300,
    adults: 2,
    children: 1,
    vatRate: 7,
  })
  assert.equal(r.subtotalTnd, 750)
  assert.equal(r.vatTnd, 52.5)
  assert.equal(r.totalTnd, 802.5)
})

test("pricing: vatRate=7 vs vatRate=19 — même HT, différence TVA exacte", () => {
  // Même base HT (500 TND, 1 adulte). Seule la TVA diffère.
  const r19 = computePriceBreakdown({ unitPriceTnd: 500, adults: 1, vatRate: 19 })
  const r7 = computePriceBreakdown({ unitPriceTnd: 500, adults: 1, vatRate: 7 })

  assert.equal(r19.subtotalTnd, 500) // HT identique
  assert.equal(r7.subtotalTnd, 500)

  assert.equal(r19.vatTnd, 95) // 500 × 19 % = 95
  assert.equal(r7.vatTnd, 35) // 500 × 7 %  = 35

  assert.equal(r19.totalTnd, 595) // 500 + 95
  assert.equal(r7.totalTnd, 535) // 500 + 35

  // Écart TTC : exactement 12 % de la base HT (pas de double-TVA).
  assert.equal(r19.totalTnd - r7.totalTnd, 60) // (19 % − 7 %) × 500 = 60
})

test("pricing: convention HT — pas de double-TVA à vatRate=7", () => {
  // unitPriceTnd = HT. TVA appliquée une seule fois.
  // Si double-TVA : 200 × 1.07 × 1.07 = 228.98 — ce résultat doit être absent.
  const r = computePriceBreakdown({ unitPriceTnd: 200, adults: 1, vatRate: 7 })
  assert.equal(r.subtotalTnd, 200) // base HT inchangée
  assert.equal(r.totalTnd, 214) // 200 × 1.07 = 214, PAS 228.98
  assert.notEqual(r.totalTnd, 228.98)
})
