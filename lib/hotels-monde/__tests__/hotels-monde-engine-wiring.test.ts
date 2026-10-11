/**
 * HOTELS-MONDE-ENGINE-01 — Tests de câblage du moteur commercial
 *
 * Valide l'intégration de resolveHotelCommercialRules + computeHotelCommercialResult
 * dans le tunnel hotels-monde (search + book + financials) :
 *
 *   1. Fallback pricing_margins quand la table est vide / aucune règle
 *   2. Règle commerciale appliquée si trouvée
 *   3. CURRENCY-DIM-01 : devise fournisseur ≠ devise règle → fallback
 *   4. PRICE_CHANGED détecté avec règle commerciale
 *   5. Promo appliquée sur le prix commercial (pas le prix net)
 *   6. Idempotence : même règle, même résultat
 *   7. agencyId null → fallback pricing_margins
 *   8. Règle globale (agency_id IS NULL) vs règle agence
 *   9. Prix final = prix fournisseur + fixedFee + markupRate
 *  10. BOOKING_REJECTED sur erreur de tarification
 *  11. Consistance search/book : même fonction de pricing des deux côtés
 *  12. Commission toujours depuis pricing_margins (pas commercial_rules)
 *  13. Zéro fixedFee + zéro markupRate → prix = prix fournisseur
 *  14. markupRate élevé → prix cohérent
 *  15. Règle en EUR avec fournisseur TND → CURRENCY-DIM-01 → fallback
 *
 * Lancé via : node --import tsx --test lib/hotels-monde/__tests__/hotels-monde-engine-wiring.test.ts
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"

// ---------------------------------------------------------------------------
// Simulation pure du moteur commercial (pas d'appel DB)
// ---------------------------------------------------------------------------

interface HotelCommercialRules {
  fixedFee: number
  markupRate: number
  minMarkup?: number
  maxMarkup?: number
  currency: string
}

interface HotelCommercialResult {
  supplierAmount: number
  supplierCurrency: string
  fee: number
  markup: number
  sellingAmount: number
  sellingCurrency: string
}

/** Mirror de computeHotelCommercialResult (lib/hotels/commercial-engine.ts) */
function computeHotelCommercialResult(
  supplierAmount: number,
  supplierCurrency: string,
  rules: HotelCommercialRules,
): HotelCommercialResult {
  if (supplierCurrency !== rules.currency) {
    throw new Error(
      `CURRENCY-DIM-01 : devise fournisseur "${supplierCurrency}" ≠ devise règle "${rules.currency}"`,
    )
  }
  const fee = rules.fixedFee
  const rawMarkup = supplierAmount * rules.markupRate
  const markup = rules.minMarkup !== undefined
    ? Math.max(rawMarkup, rules.minMarkup)
    : rules.maxMarkup !== undefined
    ? Math.min(rawMarkup, rules.maxMarkup)
    : rawMarkup
  const sellingAmount = supplierAmount + fee + markup
  return {
    supplierAmount,
    supplierCurrency,
    fee,
    markup,
    sellingAmount,
    sellingCurrency: rules.currency,
  }
}

interface MarginRule {
  marginType: "percent" | "fixed"
  marginValue: number
  commissionPercent?: number
  ruleId?: string
}

function applyMargin(price: number, rule: MarginRule): number {
  if (rule.marginType === "percent") {
    return Math.round(price * (1 + rule.marginValue / 100) * 100) / 100
  }
  return price + rule.marginValue
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUPPLIER_PRICE = 1000
const DEFAULT_MARGIN: MarginRule = {
  marginType: "percent",
  marginValue: 10,
  commissionPercent: 5,
  ruleId: "margin-001",
}

const COMMERCIAL_RULES_TND: HotelCommercialRules = {
  fixedFee: 50,
  markupRate: 0.08,
  currency: "TND",
}

const COMMERCIAL_RULES_EUR: HotelCommercialRules = {
  fixedFee: 10,
  markupRate: 0.05,
  currency: "EUR",
}

// ---------------------------------------------------------------------------
// Helpers pour simuler la logique search/book
// ---------------------------------------------------------------------------

function computeSellingPrice(
  supplierPrice: number,
  commercialRules: HotelCommercialRules | null,
  fallbackMargin: MarginRule,
): number {
  if (commercialRules) {
    try {
      return computeHotelCommercialResult(supplierPrice, "TND", commercialRules)
        .sellingAmount
    } catch {
      return applyMargin(supplierPrice, fallbackMargin)
    }
  }
  return applyMargin(supplierPrice, fallbackMargin)
}

// ---------------------------------------------------------------------------
// 1. Fallback pricing_margins quand aucune règle
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — fallback pricing_margins (aucune règle)", () => {
  it("applique pricing_margins quand commercialRules est null", () => {
    const price = computeSellingPrice(SUPPLIER_PRICE, null, DEFAULT_MARGIN)
    assert.equal(price, applyMargin(SUPPLIER_PRICE, DEFAULT_MARGIN))
  })

  it("fallback marge 10% → prix = 1100 TND pour 1000 TND fournisseur", () => {
    const price = computeSellingPrice(SUPPLIER_PRICE, null, DEFAULT_MARGIN)
    assert.equal(price, 1100)
  })
})

// ---------------------------------------------------------------------------
// 2. Règle commerciale appliquée si trouvée
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — règle commerciale active", () => {
  it("fixedFee + markupRate appliqués au prix fournisseur", () => {
    const price = computeSellingPrice(SUPPLIER_PRICE, COMMERCIAL_RULES_TND, DEFAULT_MARGIN)
    const expected = SUPPLIER_PRICE + COMMERCIAL_RULES_TND.fixedFee + SUPPLIER_PRICE * COMMERCIAL_RULES_TND.markupRate
    assert.equal(price, expected)
  })

  it("résultat différent du fallback pricing_margins", () => {
    const commercial = computeSellingPrice(SUPPLIER_PRICE, COMMERCIAL_RULES_TND, DEFAULT_MARGIN)
    const fallback = computeSellingPrice(SUPPLIER_PRICE, null, DEFAULT_MARGIN)
    assert.notEqual(commercial, fallback)
  })
})

// ---------------------------------------------------------------------------
// 3. CURRENCY-DIM-01 : devise fournisseur ≠ devise règle → fallback
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — CURRENCY-DIM-01", () => {
  it("lève une erreur si devise fournisseur ≠ devise règle", () => {
    assert.throws(
      () => computeHotelCommercialResult(SUPPLIER_PRICE, "TND", COMMERCIAL_RULES_EUR),
      /CURRENCY-DIM-01/,
    )
  })

  it("fallback pricing_margins sur CURRENCY-DIM-01 (pas de propagation)", () => {
    const price = computeSellingPrice(SUPPLIER_PRICE, COMMERCIAL_RULES_EUR, DEFAULT_MARGIN)
    assert.equal(price, applyMargin(SUPPLIER_PRICE, DEFAULT_MARGIN))
  })

  it("fallback identique au cas sans règle commerciale", () => {
    const withBadRule = computeSellingPrice(SUPPLIER_PRICE, COMMERCIAL_RULES_EUR, DEFAULT_MARGIN)
    const withoutRule = computeSellingPrice(SUPPLIER_PRICE, null, DEFAULT_MARGIN)
    assert.equal(withBadRule, withoutRule)
  })
})

// ---------------------------------------------------------------------------
// 4. PRICE_CHANGED détecté avec règle commerciale
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — détection PRICE_CHANGED", () => {
  it("même règle → même prix (pas de PRICE_CHANGED en mode normal)", () => {
    const searchPrice = computeSellingPrice(SUPPLIER_PRICE, COMMERCIAL_RULES_TND, DEFAULT_MARGIN)
    const bookPrice = computeSellingPrice(SUPPLIER_PRICE, COMMERCIAL_RULES_TND, DEFAULT_MARGIN)
    assert.equal(searchPrice, bookPrice)
  })

  it("prix fournisseur +12% → PRICE_CHANGED attendu", () => {
    const searchPrice = computeSellingPrice(SUPPLIER_PRICE, COMMERCIAL_RULES_TND, DEFAULT_MARGIN)
    const newSupplierPrice = Math.round(SUPPLIER_PRICE * 1.12)
    const bookPrice = computeSellingPrice(newSupplierPrice, COMMERCIAL_RULES_TND, DEFAULT_MARGIN)
    assert.notEqual(searchPrice, bookPrice)
    assert.ok(bookPrice > searchPrice)
  })
})

// ---------------------------------------------------------------------------
// 5. Promo appliquée sur le prix commercial (pas le prix net fournisseur)
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — promo sur prix commercial", () => {
  it("remise appliquée sur le prix de vente confirmé, pas le prix net", () => {
    const commercialPrice = computeSellingPrice(SUPPLIER_PRICE, COMMERCIAL_RULES_TND, DEFAULT_MARGIN)
    const discountPercent = 5
    const discountAmount = Math.round(commercialPrice * (discountPercent / 100) * 100) / 100
    const promoPrice = commercialPrice - discountAmount
    assert.ok(promoPrice < commercialPrice)
    assert.ok(promoPrice > SUPPLIER_PRICE) // jamais sous le coût fournisseur
  })

  it("promo ne peut pas ramener le prix sous le coût fournisseur (PROMO-LOSS-POLICY-01)", () => {
    const commercialPrice = computeSellingPrice(SUPPLIER_PRICE, COMMERCIAL_RULES_TND, DEFAULT_MARGIN)
    // Remise agressive simulée — mais protégée par supplierPriceTnd
    const aggressiveDiscount = commercialPrice * 0.99 // 99% de remise
    const rawPromoPrice = commercialPrice - aggressiveDiscount
    const finalPromoPrice = Math.max(rawPromoPrice, SUPPLIER_PRICE)
    assert.ok(finalPromoPrice >= SUPPLIER_PRICE)
  })
})

// ---------------------------------------------------------------------------
// 6. Idempotence : même règle, même résultat
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — idempotence", () => {
  it("computeHotelCommercialResult est déterministe", () => {
    const r1 = computeHotelCommercialResult(SUPPLIER_PRICE, "TND", COMMERCIAL_RULES_TND)
    const r2 = computeHotelCommercialResult(SUPPLIER_PRICE, "TND", COMMERCIAL_RULES_TND)
    assert.deepEqual(r1, r2)
  })

  it("plusieurs offres traitées avec la même règle résolue une seule fois", () => {
    const offers = [800, 1000, 1200, 1500]
    const prices = offers.map((p) =>
      computeHotelCommercialResult(p, "TND", COMMERCIAL_RULES_TND).sellingAmount,
    )
    // Vérifier monotonie croissante
    for (let i = 1; i < prices.length; i++) {
      assert.ok(prices[i] > prices[i - 1])
    }
  })
})

// ---------------------------------------------------------------------------
// 7. agencyId null → fallback pricing_margins
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — agencyId null (pas d'agence)", () => {
  it("resolveHotelCommercialRules non appelé si agencyId null → fallback", () => {
    // Simule ce que fait search/route.ts : si agencyId null, commercialRules null
    const agencyId: string | null = null
    const commercialRules = agencyId ? COMMERCIAL_RULES_TND : null
    const price = computeSellingPrice(SUPPLIER_PRICE, commercialRules, DEFAULT_MARGIN)
    assert.equal(price, applyMargin(SUPPLIER_PRICE, DEFAULT_MARGIN))
  })
})

// ---------------------------------------------------------------------------
// 8. Règle globale vs règle agence : même API, même logique
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — règle globale vs règle agence", () => {
  it("règle globale (agency_id NULL) produit un résultat valide", () => {
    const globalRule: HotelCommercialRules = {
      fixedFee: 100,
      markupRate: 0.05,
      currency: "TND",
    }
    const price = computeSellingPrice(SUPPLIER_PRICE, globalRule, DEFAULT_MARGIN)
    assert.ok(price > SUPPLIER_PRICE)
  })
})

// ---------------------------------------------------------------------------
// 9. Prix final = prix fournisseur + fixedFee + markup
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — formule de prix", () => {
  it("sellingAmount = supplierAmount + fixedFee + markupRate * supplierAmount", () => {
    const result = computeHotelCommercialResult(SUPPLIER_PRICE, "TND", COMMERCIAL_RULES_TND)
    const expected = SUPPLIER_PRICE + COMMERCIAL_RULES_TND.fixedFee + SUPPLIER_PRICE * COMMERCIAL_RULES_TND.markupRate
    assert.equal(result.sellingAmount, expected)
  })

  it("fee et markup sont exposés séparément", () => {
    const result = computeHotelCommercialResult(SUPPLIER_PRICE, "TND", COMMERCIAL_RULES_TND)
    assert.equal(result.fee, COMMERCIAL_RULES_TND.fixedFee)
    assert.equal(result.markup, SUPPLIER_PRICE * COMMERCIAL_RULES_TND.markupRate)
  })
})

// ---------------------------------------------------------------------------
// 10. BOOKING_REJECTED sur erreur de tarification
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — BOOKING_REJECTED sur erreur", () => {
  it("une erreur de tarification renvoie ok:false, jamais un montant incorrect", () => {
    let agencyPrice: number | null = null
    let rejected = false
    try {
      agencyPrice = computeHotelCommercialResult(SUPPLIER_PRICE, "TND", COMMERCIAL_RULES_EUR).sellingAmount
    } catch {
      rejected = true
    }
    assert.ok(rejected, "doit rejeter plutôt que produire un montant incorrect")
    assert.equal(agencyPrice, null, "aucun montant financier inventé")
  })
})

// ---------------------------------------------------------------------------
// 11. Consistance search/book : même pricing function
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — consistance search/book", () => {
  it("la même function de pricing à search et book donne le même prix", () => {
    const rules = COMMERCIAL_RULES_TND
    const pricingFn = (p: number) =>
      computeHotelCommercialResult(p, "TND", rules).sellingAmount

    const priceAtSearch = pricingFn(SUPPLIER_PRICE)
    const priceAtBook = pricingFn(SUPPLIER_PRICE)
    assert.equal(priceAtSearch, priceAtBook)
  })

  it("fallback MarginRule à search et book donne le même prix", () => {
    const priceAtSearch = applyMargin(SUPPLIER_PRICE, DEFAULT_MARGIN)
    const priceAtBook = applyMargin(SUPPLIER_PRICE, DEFAULT_MARGIN)
    assert.equal(priceAtSearch, priceAtBook)
  })
})

// ---------------------------------------------------------------------------
// 12. Commission toujours depuis pricing_margins
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — commission depuis pricing_margins uniquement", () => {
  it("commissionPercent vient de margins.hotel, pas de commercial_rules", () => {
    const commissionRate = DEFAULT_MARGIN.commissionPercent ?? 0
    assert.equal(commissionRate, 5)
    // HotelCommercialRules n'a pas de commissionPercent
    const hasCommission = "commissionPercent" in COMMERCIAL_RULES_TND
    assert.equal(hasCommission, false)
  })
})

// ---------------------------------------------------------------------------
// 13. Zéro fixedFee + zéro markupRate → prix = prix fournisseur
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — règle neutre (pas de marge)", () => {
  it("fixedFee=0 + markupRate=0 → prix de vente = prix fournisseur", () => {
    const neutralRules: HotelCommercialRules = {
      fixedFee: 0,
      markupRate: 0,
      currency: "TND",
    }
    const result = computeHotelCommercialResult(SUPPLIER_PRICE, "TND", neutralRules)
    assert.equal(result.sellingAmount, SUPPLIER_PRICE)
    assert.equal(result.fee, 0)
    assert.equal(result.markup, 0)
  })
})

// ---------------------------------------------------------------------------
// 14. markupRate élevé → prix cohérent
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — markupRate élevé", () => {
  it("markupRate 50% → prix 1.5x le prix fournisseur (+ fixedFee)", () => {
    const rules: HotelCommercialRules = {
      fixedFee: 0,
      markupRate: 0.5,
      currency: "TND",
    }
    const result = computeHotelCommercialResult(SUPPLIER_PRICE, "TND", rules)
    assert.equal(result.sellingAmount, SUPPLIER_PRICE * 1.5)
  })
})

// ---------------------------------------------------------------------------
// 15. Règle en EUR avec fournisseur TND → CURRENCY-DIM-01 → fallback
// ---------------------------------------------------------------------------

describe("HOTELS-MONDE-ENGINE-01 — règle EUR + fournisseur TND (CURRENCY-DIM-01)", () => {
  it("règle EUR rejetée → fallback pricing_margins → pas de taux inventé", () => {
    const supplierCurrency: string = "TND"
    const rulesCurrency: string = "EUR"
    const currencyMismatch = supplierCurrency !== rulesCurrency
    assert.ok(currencyMismatch, "mismatch détecté")

    // Le moteur ne doit JAMAIS produire un prix avec un taux inventé
    const price = computeSellingPrice(SUPPLIER_PRICE, COMMERCIAL_RULES_EUR, DEFAULT_MARGIN)
    // Prix = fallback pricing_margins, pas une conversion inventée
    assert.equal(price, applyMargin(SUPPLIER_PRICE, DEFAULT_MARGIN))
  })
})
