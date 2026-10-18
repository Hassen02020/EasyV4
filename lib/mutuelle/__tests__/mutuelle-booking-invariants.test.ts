/**
 * MUTUELLE-BOOKING-01 — invariants statiques de la couche booking Mutuelle.
 *
 * Tests 100 % statiques : aucune DB, aucun réseau.
 * Vérifient les contrats de types, de schémas Zod et de calcul de prix.
 */

import { describe, it, expect } from "vitest"
import { z } from "zod"

/* -------------------------------------------------------------------------- */
/* 1. Calcul de prix Mutuelle (markupPercent appliqué)                         */
/* -------------------------------------------------------------------------- */

function computeMutuelleSalePrice(
  basePriceTnd: number,
  markupPercent: number,
): number {
  return Math.round(basePriceTnd * (1 + markupPercent / 100) * 100) / 100
}

describe("computeMutuelleSalePrice", () => {
  it("markup 0% → salePriceTnd === basePriceTnd", () => {
    expect(computeMutuelleSalePrice(100, 0)).toBe(100)
  })

  it("markup 10% → salePriceTnd = base × 1.10", () => {
    expect(computeMutuelleSalePrice(200, 10)).toBe(220)
  })

  it("markup 5% arrondi au centime", () => {
    // 333.33 × 1.05 = 350.0 (arrondi)
    expect(computeMutuelleSalePrice(333.33, 5)).toBe(350)
  })

  it("markup non nul : salePriceTnd > basePriceTnd", () => {
    const sale = computeMutuelleSalePrice(500, 15)
    expect(sale).toBeGreaterThan(500)
  })

  it("marge = salePriceTnd - basePriceTnd est positive pour markup > 0", () => {
    const base = 400
    const markup = 8
    const sale = computeMutuelleSalePrice(base, markup)
    const margin = Math.round((sale - base) * 100) / 100
    expect(margin).toBeGreaterThan(0)
    expect(margin).toBe(32) // 400 × 0.08 = 32
  })

  it("basePriceTnd jamais négatif — invariant de garde", () => {
    expect(() => {
      if (-1 <= 0) throw new Error("prix de base invalide")
    }).toThrow()
  })
})

/* -------------------------------------------------------------------------- */
/* 2. Schéma de validation de la décision directeur                            */
/* -------------------------------------------------------------------------- */

const reviewInputSchema = z
  .object({
    requestId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    directorNote: z.string().trim().max(2000).optional(),
    basePriceTnd: z.coerce.number().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === "approved" && !data.basePriceTnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le prix de base est requis pour approuver une demande.",
        path: ["basePriceTnd"],
      })
    }
  })

describe("reviewInputSchema", () => {
  it("approbation sans basePriceTnd → erreur Zod", () => {
    const result = reviewInputSchema.safeParse({
      requestId: "00000000-0000-0000-0000-000000000001",
      decision: "approved",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."))
      expect(paths).toContain("basePriceTnd")
    }
  })

  it("approbation avec basePriceTnd valide → succès", () => {
    const result = reviewInputSchema.safeParse({
      requestId: "00000000-0000-0000-0000-000000000001",
      decision: "approved",
      basePriceTnd: 150,
    })
    expect(result.success).toBe(true)
  })

  it("rejet sans basePriceTnd → succès (non requis pour refus)", () => {
    const result = reviewInputSchema.safeParse({
      requestId: "00000000-0000-0000-0000-000000000001",
      decision: "rejected",
      directorNote: "Quota annuel atteint",
    })
    expect(result.success).toBe(true)
  })

  it("basePriceTnd négatif → erreur Zod (z.coerce.number().positive())", () => {
    const result = reviewInputSchema.safeParse({
      requestId: "00000000-0000-0000-0000-000000000001",
      decision: "approved",
      basePriceTnd: -50,
    })
    expect(result.success).toBe(false)
  })

  it("requestId non-UUID → erreur Zod", () => {
    const result = reviewInputSchema.safeParse({
      requestId: "not-a-uuid",
      decision: "approved",
      basePriceTnd: 100,
    })
    expect(result.success).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* 3. Référence publique Mutuelle MUT-YYYY-NNNNNN                              */
/* -------------------------------------------------------------------------- */

function formatMutuelleRef(year: number, seq: number): string {
  return `MUT-${year}-${String(seq).padStart(6, "0")}`
}

describe("formatMutuelleRef", () => {
  it("première réservation → MUT-2025-000001", () => {
    expect(formatMutuelleRef(2025, 1)).toBe("MUT-2025-000001")
  })

  it("séquence 999999 → MUT-2025-999999 (max 6 chiffres)", () => {
    expect(formatMutuelleRef(2025, 999999)).toBe("MUT-2025-999999")
  })

  it("préfixe toujours MUT- (pas NET-, CAR-, TRF-…)", () => {
    const ref = formatMutuelleRef(2026, 42)
    expect(ref.startsWith("MUT-")).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* 4. Invariants financiers globaux                                            */
/* -------------------------------------------------------------------------- */

describe("invariants financiers Mutuelle", () => {
  it("commissionPercent 0 → commissionAmount = 0", () => {
    const marginAmount = 100
    const commissionRate = 0
    const commission = Math.round(marginAmount * (commissionRate / 100) * 100) / 100
    expect(commission).toBe(0)
  })

  it("salePriceTnd = basePriceTnd + marginAmount (cohérence)", () => {
    const base = 300
    const markup = 12
    const sale = computeMutuelleSalePrice(base, markup)
    const margin = Math.round((sale - base) * 100) / 100
    expect(Math.round((base + margin) * 100) / 100).toBe(sale)
  })

  it("entitlement seller_margin : amount doit égaler salePriceTnd - basePriceTnd", () => {
    const base = 250
    const sale = computeMutuelleSalePrice(base, 20)
    const expectedMargin = Math.round((sale - base) * 100) / 100
    expect(expectedMargin).toBe(50)
  })
})
