/**
 * PRICING-CONSISTENCY-01 — Symétrie search/booking sur les erreurs de tarification
 *
 * Valide que :
 *   1. La closure de pricing pour le booking try/catch l'exception et retombe
 *      sur pricing_margins (même comportement que search/route.ts)
 *   2. La closure ne propage PAS l'erreur vers le moteur fournisseur (qui aurait
 *      retourné BOOKING_REJECTED)
 *   3. Search et booking produisent le MÊME prix quand la règle réussit
 *   4. Search et booking produisent le MÊME prix quand la règle échoue (fallback)
 *   5. pricingUsedRule reflète correctement le chemin emprunté (pour marginBasis)
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"

// ---------------------------------------------------------------------------
// Simulation pure — même logique que l'implémentation réelle
// ---------------------------------------------------------------------------

interface HotelCommercialRules {
  fixedFee: number
  markupRate: number
  currency: string
}

interface MarginRule {
  marginType: "percent" | "fixed"
  marginValue: number
  commissionPercent?: number
}

function computeHotelCommercialResult(
  supplierAmount: number,
  supplierCurrency: string,
  rules: HotelCommercialRules,
): { sellingAmount: number } {
  if (supplierCurrency !== rules.currency) {
    throw new Error(
      `CURRENCY-DIM-01 : devise fournisseur "${supplierCurrency}" ≠ devise règle "${rules.currency}"`,
    )
  }
  return {
    sellingAmount:
      supplierAmount + rules.fixedFee + supplierAmount * rules.markupRate,
  }
}

function applyMargin(price: number, rule: MarginRule): number {
  if (rule.marginType === "percent") {
    return Math.round(price * (1 + rule.marginValue / 100) * 100) / 100
  }
  return price + rule.marginValue
}

/**
 * Simule la closure de pricing passée à bookWorldHotel() dans
 * guest-booking-actions.ts après PRICING-CONSISTENCY-01 :
 * try commercial rule → on exception, log + fallback.
 */
function makeBookingPricingFn(
  commercialRules: HotelCommercialRules | null,
  margins: MarginRule,
  onFallback?: (err: unknown) => void,
): { fn: (p: number) => number; usedRule: () => boolean } {
  let _usedRule = false
  const fn = commercialRules
    ? (p: number) => {
        try {
          const amount = computeHotelCommercialResult(
            p,
            "TND",
            commercialRules,
          ).sellingAmount
          _usedRule = true
          return amount
        } catch (err) {
          onFallback?.(err)
          return applyMargin(p, margins)
        }
      }
    : (p: number) => applyMargin(p, margins)
  return { fn, usedRule: () => _usedRule }
}

/**
 * Simule computeSellingPrice de search/route.ts (déjà testé dans
 * hotels-monde-engine-wiring.test.ts — référence ici pour symétrie).
 */
function makeSearchPricingFn(
  commercialRules: HotelCommercialRules | null,
  margins: MarginRule,
): (p: number) => number {
  return (p: number) => {
    if (commercialRules) {
      try {
        return computeHotelCommercialResult(p, "TND", commercialRules)
          .sellingAmount
      } catch {
        return applyMargin(p, margins)
      }
    }
    return applyMargin(p, margins)
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUPPLIER_PRICE = 1000

const MARGIN: MarginRule = {
  marginType: "percent",
  marginValue: 10,
  commissionPercent: 5,
}

const RULES_TND: HotelCommercialRules = {
  fixedFee: 50,
  markupRate: 0.08,
  currency: "TND",
}

const RULES_EUR: HotelCommercialRules = {
  fixedFee: 10,
  markupRate: 0.05,
  currency: "EUR", // mismatch avec fournisseur TND → CURRENCY-DIM-01
}

// ---------------------------------------------------------------------------
// 1. Closure booking — règle valide → sellingAmount
// ---------------------------------------------------------------------------

describe("PRICING-CONSISTENCY-01 — booking pricingFn : règle valide", () => {
  it("retourne sellingAmount si la règle est applicable", () => {
    const { fn } = makeBookingPricingFn(RULES_TND, MARGIN)
    const price = fn(SUPPLIER_PRICE)
    const expected =
      SUPPLIER_PRICE +
      RULES_TND.fixedFee +
      SUPPLIER_PRICE * RULES_TND.markupRate
    assert.equal(price, expected)
  })

  it("ne propage pas d'exception quand la règle réussit", () => {
    const { fn } = makeBookingPricingFn(RULES_TND, MARGIN)
    assert.doesNotThrow(() => fn(SUPPLIER_PRICE))
  })

  it("pricingUsedRule = true quand la règle commerciale est appliquée", () => {
    const { fn, usedRule } = makeBookingPricingFn(RULES_TND, MARGIN)
    fn(SUPPLIER_PRICE)
    assert.equal(usedRule(), true)
  })
})

// ---------------------------------------------------------------------------
// 2. Closure booking — règle invalide (CURRENCY-DIM-01) → fallback
// ---------------------------------------------------------------------------

describe("PRICING-CONSISTENCY-01 — booking pricingFn : règle invalide → fallback", () => {
  it("ne propage pas l'exception CURRENCY-DIM-01", () => {
    const { fn } = makeBookingPricingFn(RULES_EUR, MARGIN)
    assert.doesNotThrow(() => fn(SUPPLIER_PRICE))
  })

  it("retourne applyMargin (pricing_margins) en cas d'exception", () => {
    const { fn } = makeBookingPricingFn(RULES_EUR, MARGIN)
    const price = fn(SUPPLIER_PRICE)
    assert.equal(price, applyMargin(SUPPLIER_PRICE, MARGIN))
  })

  it("pricingUsedRule = false quand la règle échoue et fallback s'applique", () => {
    const { fn, usedRule } = makeBookingPricingFn(RULES_EUR, MARGIN)
    fn(SUPPLIER_PRICE)
    assert.equal(usedRule(), false)
  })

  it("appelle le callback onFallback avec l'erreur originale", () => {
    let capturedErr: unknown = null
    const { fn } = makeBookingPricingFn(RULES_EUR, MARGIN, (err) => {
      capturedErr = err
    })
    fn(SUPPLIER_PRICE)
    assert.ok(capturedErr instanceof Error)
    assert.ok((capturedErr as Error).message.includes("CURRENCY-DIM-01"))
  })

  it("fallback ne produit pas un taux inventé (montant stable = pricing_margins)", () => {
    const { fn } = makeBookingPricingFn(RULES_EUR, MARGIN)
    const fallbackPrice = fn(SUPPLIER_PRICE)
    const expectedFallback = applyMargin(SUPPLIER_PRICE, MARGIN)
    assert.equal(fallbackPrice, expectedFallback)
    // Vérifie que le prix n'est pas calculé avec le taux EUR → jamais != applyMargin
    const wrongPrice =
      SUPPLIER_PRICE +
      RULES_EUR.fixedFee +
      SUPPLIER_PRICE * RULES_EUR.markupRate
    assert.notEqual(fallbackPrice, wrongPrice)
  })
})

// ---------------------------------------------------------------------------
// 3. Closure booking — pas de règle → applyMargin direct
// ---------------------------------------------------------------------------

describe("PRICING-CONSISTENCY-01 — booking pricingFn : aucune règle", () => {
  it("retourne applyMargin quand commercialRules est null", () => {
    const { fn } = makeBookingPricingFn(null, MARGIN)
    const price = fn(SUPPLIER_PRICE)
    assert.equal(price, applyMargin(SUPPLIER_PRICE, MARGIN))
  })

  it("pricingUsedRule reste false quand aucune règle n'est passée", () => {
    const { fn, usedRule } = makeBookingPricingFn(null, MARGIN)
    fn(SUPPLIER_PRICE)
    assert.equal(usedRule(), false)
  })
})

// ---------------------------------------------------------------------------
// 4. Symétrie search / booking — règle valide
// ---------------------------------------------------------------------------

describe("PRICING-CONSISTENCY-01 — symétrie search/booking : règle valide", () => {
  it("search et booking produisent le même prix quand la règle réussit", () => {
    const searchFn = makeSearchPricingFn(RULES_TND, MARGIN)
    const { fn: bookingFn } = makeBookingPricingFn(RULES_TND, MARGIN)
    assert.equal(searchFn(SUPPLIER_PRICE), bookingFn(SUPPLIER_PRICE))
  })

  it("même résultat sur plusieurs prix fournisseurs", () => {
    const prices = [500, 800, 1000, 1500, 2000]
    const searchFn = makeSearchPricingFn(RULES_TND, MARGIN)
    const { fn: bookingFn } = makeBookingPricingFn(RULES_TND, MARGIN)
    for (const p of prices) {
      assert.equal(
        searchFn(p),
        bookingFn(p),
        `prix fournisseur ${p} TND : search et booking doivent coincider`,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Symétrie search / booking — règle invalide → même fallback
// ---------------------------------------------------------------------------

describe("PRICING-CONSISTENCY-01 — symétrie search/booking : règle invalide → fallback identique", () => {
  it("fallback search = fallback booking quand CURRENCY-DIM-01", () => {
    const searchFn = makeSearchPricingFn(RULES_EUR, MARGIN)
    const { fn: bookingFn } = makeBookingPricingFn(RULES_EUR, MARGIN)
    assert.equal(searchFn(SUPPLIER_PRICE), bookingFn(SUPPLIER_PRICE))
  })

  it("fallback sans règle search = fallback booking (aucune règle)", () => {
    const searchFn = makeSearchPricingFn(null, MARGIN)
    const { fn: bookingFn } = makeBookingPricingFn(null, MARGIN)
    assert.equal(searchFn(SUPPLIER_PRICE), bookingFn(SUPPLIER_PRICE))
  })

  it("la même recette : search TND + booking TND → même prix", () => {
    const searchValid = makeSearchPricingFn(RULES_TND, MARGIN)(SUPPLIER_PRICE)
    const searchFallback = makeSearchPricingFn(
      RULES_EUR,
      MARGIN,
    )(SUPPLIER_PRICE)
    const { fn: bookFn } = makeBookingPricingFn(RULES_EUR, MARGIN)
    const bookFallback = bookFn(SUPPLIER_PRICE)
    // les deux fallbacks sont identiques
    assert.equal(searchFallback, bookFallback)
    // le fallback est différent du prix avec règle valide
    assert.notEqual(searchValid, searchFallback)
  })
})

// ---------------------------------------------------------------------------
// 6. marginBasis — reflète le chemin réellement emprunté
// ---------------------------------------------------------------------------

describe("PRICING-CONSISTENCY-01 — marginBasis selon pricingUsedRule", () => {
  it("pricingUsedRule=true → marginBasis mentionne la règle commerciale", () => {
    const { fn, usedRule } = makeBookingPricingFn(RULES_TND, MARGIN)
    fn(SUPPLIER_PRICE)
    const basis = usedRule()
      ? `règle commerciale (fixedFee ${RULES_TND.fixedFee} TND + markupRate ${Math.round(RULES_TND.markupRate * 100)}%)`
      : `marge vendeur (${MARGIN.marginValue}%)`
    assert.ok(basis.includes("règle commerciale"))
  })

  it("pricingUsedRule=false → marginBasis mentionne pricing_margins", () => {
    const { fn, usedRule } = makeBookingPricingFn(RULES_EUR, MARGIN)
    fn(SUPPLIER_PRICE)
    const basis = usedRule()
      ? `règle commerciale (fixedFee ${RULES_EUR.fixedFee} TND + markupRate ${Math.round(RULES_EUR.markupRate * 100)}%)`
      : `marge vendeur (${MARGIN.marginValue}%)`
    assert.ok(basis.includes("marge vendeur"))
    assert.ok(!basis.includes("règle commerciale"))
  })
})
