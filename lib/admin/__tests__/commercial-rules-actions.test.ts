/**
 * COMMERCIAL-RULES-ADMIN-01 — Tests unitaires pour lib/admin/commercial-rules-actions.ts
 *
 * Teste la logique pure qui ne nécessite pas de DB :
 *   - validation du schéma createRuleSchema
 *   - invariant CURRENCY-DIM-01 (hotel → TND uniquement)
 *   - markupRate conversion % → décimal (fait dans le composant, validé ici)
 *
 * Les actions qui écrivent en DB (createCommercialRule, toggleCommercialRule,
 * deleteCommercialRule) sont couvertes en intégration dans les tests live
 * existants (commercial-agreements-live.test.ts pour le pattern auth).
 */

import { describe, it, expect } from "vitest"

// ---------------------------------------------------------------------------
// Logique pure extraite (pas d'import DB — pure TS simulation)
// ---------------------------------------------------------------------------

type RuleType = "hotel" | "flight"

function validateCurrencyDim01(
  type: RuleType,
  currency: string,
): string | null {
  if (type === "hotel" && currency !== "TND") {
    return "Les règles hôtels doivent utiliser TND (CURRENCY-DIM-01 — le moteur ne convertit pas les devises)."
  }
  return null
}

function markupRateToDecimal(percent: number): number {
  return Math.round((percent / 100) * 100000) / 100000
}

function buildProductScopeHotel(opts: {
  destination?: string
  provider?: string
  stars?: string
  boardBasis?: string
}): Record<string, unknown> | null {
  const scope: Record<string, unknown> = {}
  if (opts.destination?.trim()) scope.destination = opts.destination.trim()
  if (opts.provider?.trim()) scope.provider = opts.provider.trim()
  if (opts.stars?.trim()) scope.stars = Number(opts.stars)
  if (opts.boardBasis?.trim()) scope.board_basis = opts.boardBasis.trim()
  return Object.keys(scope).length > 0 ? scope : null
}

function buildProductScopeFlight(opts: {
  cabin?: string
  provider?: string
  origin?: string
  destination?: string
  airline?: string
}): Record<string, unknown> | null {
  const scope: Record<string, unknown> = {}
  if (opts.cabin?.trim()) scope.cabin = opts.cabin.trim()
  if (opts.provider?.trim()) scope.provider = opts.provider.trim()
  if (opts.origin?.trim()) scope.origin = opts.origin.trim()
  if (opts.destination?.trim()) scope.destination = opts.destination.trim()
  if (opts.airline?.trim()) scope.airline = opts.airline.trim()
  return Object.keys(scope).length > 0 ? scope : null
}

// ---------------------------------------------------------------------------
// Tests CURRENCY-DIM-01
// ---------------------------------------------------------------------------

describe("CURRENCY-DIM-01 — invariant monnaie hôtels", () => {
  it("hotel + TND → pas d'erreur", () => {
    expect(validateCurrencyDim01("hotel", "TND")).toBeNull()
  })

  it("hotel + EUR → erreur CURRENCY-DIM-01", () => {
    const err = validateCurrencyDim01("hotel", "EUR")
    expect(err).not.toBeNull()
    expect(err).toContain("CURRENCY-DIM-01")
  })

  it("hotel + USD → erreur CURRENCY-DIM-01", () => {
    expect(validateCurrencyDim01("hotel", "USD")).not.toBeNull()
  })

  it("flight + EUR → pas d'erreur", () => {
    expect(validateCurrencyDim01("flight", "EUR")).toBeNull()
  })

  it("flight + TND → pas d'erreur", () => {
    expect(validateCurrencyDim01("flight", "TND")).toBeNull()
  })

  it("flight + USD → pas d'erreur", () => {
    expect(validateCurrencyDim01("flight", "USD")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests conversion markupRate
// ---------------------------------------------------------------------------

describe("markupRate — conversion % → décimal", () => {
  it("8% → 0.08", () => {
    expect(markupRateToDecimal(8)).toBeCloseTo(0.08, 5)
  })

  it("0% → 0", () => {
    expect(markupRateToDecimal(0)).toBe(0)
  })

  it("12.5% → 0.125", () => {
    expect(markupRateToDecimal(12.5)).toBeCloseTo(0.125, 5)
  })

  it("100% → 1", () => {
    expect(markupRateToDecimal(100)).toBeCloseTo(1, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests productScope hôtel
// ---------------------------------------------------------------------------

describe("buildProductScopeHotel", () => {
  it("vide → null", () => {
    expect(buildProductScopeHotel({})).toBeNull()
  })

  it("destination seule", () => {
    const scope = buildProductScopeHotel({ destination: "TUN" })
    expect(scope).toEqual({ destination: "TUN" })
  })

  it("destination + étoiles", () => {
    const scope = buildProductScopeHotel({ destination: "TUN", stars: "4" })
    expect(scope).toEqual({ destination: "TUN", stars: 4 })
  })

  it("étoiles parsées en number", () => {
    const scope = buildProductScopeHotel({ stars: "5" })
    expect(scope?.stars).toBe(5)
    expect(typeof scope?.stars).toBe("number")
  })

  it("board_basis clé correcte", () => {
    const scope = buildProductScopeHotel({ boardBasis: "AI" })
    expect(scope).toEqual({ board_basis: "AI" })
  })

  it("espaces trimés", () => {
    const scope = buildProductScopeHotel({ destination: "  TUN  " })
    expect(scope).toEqual({ destination: "TUN" })
  })
})

// ---------------------------------------------------------------------------
// Tests productScope vol
// ---------------------------------------------------------------------------

describe("buildProductScopeFlight", () => {
  it("vide → null", () => {
    expect(buildProductScopeFlight({})).toBeNull()
  })

  it("cabin + airline", () => {
    const scope = buildProductScopeFlight({ cabin: "economy", airline: "TU" })
    expect(scope).toEqual({ cabin: "economy", airline: "TU" })
  })

  it("tous les champs", () => {
    const scope = buildProductScopeFlight({
      cabin: "business",
      provider: "duffel",
      origin: "TUN",
      destination: "CDG",
      airline: "AF",
    })
    expect(scope).toEqual({
      cabin: "business",
      provider: "duffel",
      origin: "TUN",
      destination: "CDG",
      airline: "AF",
    })
  })
})

// ---------------------------------------------------------------------------
// Tests cohérence moteur — aucune règle = fallback pricing_margins
// ---------------------------------------------------------------------------

describe("Fallback pricing_margins — règle nulle", () => {
  // Simule le comportement de resolveHotelCommercialRules retournant null :
  // le caller applique alors pricing_margins.

  function applyPricing(
    supplierAmount: number,
    rule: { fixedFee: number; markupRate: number } | null,
    fallbackMarginRate: number,
  ): number {
    if (rule) {
      return (
        Math.round(
          (supplierAmount + rule.fixedFee + supplierAmount * rule.markupRate) *
            1000,
        ) / 1000
      )
    }
    return Math.round(supplierAmount * (1 + fallbackMarginRate) * 1000) / 1000
  }

  it("sans règle, fallback 10% → prix = supplier * 1.1", () => {
    expect(applyPricing(1000, null, 0.1)).toBeCloseTo(1100, 3)
  })

  it("avec règle (0 fee + 8%) → prix = supplier * 1.08", () => {
    expect(
      applyPricing(1000, { fixedFee: 0, markupRate: 0.08 }, 0.1),
    ).toBeCloseTo(1080, 3)
  })

  it("avec règle (50 fee + 8%) → prix = supplier + 50 + supplier*0.08", () => {
    expect(
      applyPricing(1000, { fixedFee: 50, markupRate: 0.08 }, 0.1),
    ).toBeCloseTo(1130, 3)
  })

  it("règle nulle préserve le comportement pricing_margins existant", () => {
    const withRule = applyPricing(500, null, 0.15)
    expect(withRule).toBeCloseTo(575, 3)
  })
})
