/**
 * Cars Pricing — Module Location de Voitures
 *
 * Calcule le coût d'une location à partir de `car_pricing_rates` (tarif
 * réel configuré par l'agence propriétaire de la flotte) — même principe
 * que `lib/transfers/pricing.ts` : aucun prix inventé, `null` si aucun
 * tarif n'est configuré pour la catégorie/lieu demandés.
 *
 * "use server" : ce module interroge Drizzle/postgres et est importé
 * depuis des Client Components (CarBookingForm) — sans cette directive le
 * code Node-only se retrouverait bundlé côté navigateur.
 */
"use server"

import { and, eq, isNull, lte, or, gte } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { carPricingRates, pricingMargins } from "@/lib/db/schema"
import { applyMargin, type MarginRule } from "@/lib/pro/pricing"

export interface CarPricingInput {
  categoryId: string
  locationId: string
  pickupAt: string // ISO datetime
  dropoffAt: string // ISO datetime
  insuranceLevel: "basic" | "standard" | "premium" | "full"
  agencyId: string
}

export interface CarPricingResult {
  rentalDays: number
  dailyRateTnd: number
  weeklyRateTnd?: number
  baseTotalTnd: number
  insuranceDailyFeeTnd: number
  insuranceTotalTnd: number
  depositTnd: number
  marginPercent?: number
  marginAmount?: number
  totalTnd: number
  currency: string
  breakdown: {
    base: number
    insurance: number
    margin: number
  }
}

function roundTnd(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Nombre de jours de location, arrondi au jour entier supérieur (comme la pratique du secteur : toute journée entamée est due). */
function computeRentalDays(pickupAt: string, dropoffAt: string): number {
  const ms = new Date(dropoffAt).getTime() - new Date(pickupAt).getTime()
  return Math.max(1, Math.ceil(ms / 86_400_000))
}

/**
 * Calcule le prix d'une location à partir du tarif réel configuré pour la
 * catégorie (et, si renseigné, le lieu). Retourne `null` si aucun tarif
 * actif n'est configuré — l'appelant doit traiter ce cas explicitement
 * (jamais de prix inventé, cf. règle anti-fabrication du produit).
 */
export async function calculateCarPrice(
  input: CarPricingInput,
): Promise<CarPricingResult | null> {
  const rentalDays = computeRentalDays(input.pickupAt, input.dropoffAt)
  const today = input.pickupAt.slice(0, 10)

  // Catalogue public (trafic anonyme, pas de session storefront) — filtre
  // fixé côté serveur (agencyId résolu par l'appelant via getDefaultAgencyId
  // ou la session partenaire, jamais une entrée utilisateur brute).
  // Le tarif le plus spécifique gagne : d'abord une ligne dédiée à ce lieu
  // (locationId non NULL), sinon la ligne "tous lieux" (locationId NULL).
  const rates = await withSystemContext((db) =>
    db
      .select()
      .from(carPricingRates)
      .where(
        and(
          eq(carPricingRates.agencyId, input.agencyId),
          eq(carPricingRates.categoryId, input.categoryId),
          eq(carPricingRates.isActive, true),
          or(isNull(carPricingRates.validFrom), lte(carPricingRates.validFrom, today)),
          or(isNull(carPricingRates.validTo), gte(carPricingRates.validTo, today)),
        ),
      ),
  )

  const rate =
    rates.find((r) => r.locationId === input.locationId) ??
    rates.find((r) => r.locationId === null)
  if (!rate) return null
  if (rentalDays < rate.minRentalDays) return null

  const dailyRateTnd = Number(rate.dailyRateTnd)
  const weeklyRateTnd = rate.weeklyRateTnd ? Number(rate.weeklyRateTnd) : undefined

  let baseTotalTnd: number
  if (weeklyRateTnd && rentalDays >= 7) {
    const weeks = Math.floor(rentalDays / 7)
    const remainderDays = rentalDays % 7
    baseTotalTnd = weeks * weeklyRateTnd + remainderDays * dailyRateTnd
  } else {
    baseTotalTnd = dailyRateTnd * rentalDays
  }
  baseTotalTnd = roundTnd(baseTotalTnd)

  const insuranceDailyFeeTnd = Number(
    rate.insuranceDailyFeeTnd?.[input.insuranceLevel] ?? 0,
  )
  const insuranceTotalTnd = roundTnd(insuranceDailyFeeTnd * rentalDays)
  const depositTnd = Number(rate.depositTnd ?? 0)

  const preMargin = roundTnd(baseTotalTnd + insuranceTotalTnd)

  const [marginRow] = await withTenantContext(
    { agencyId: input.agencyId, userId: "", isSuperAdmin: false },
    (db) =>
      db
        .select()
        .from(pricingMargins)
        .where(
          and(
            eq(pricingMargins.agencyId, input.agencyId),
            eq(pricingMargins.module, "car"),
            eq(pricingMargins.isActive, true),
          ),
        )
        .limit(1),
  )

  let marginPercent: number | undefined
  let marginAmount = 0
  let totalTnd = preMargin

  if (marginRow) {
    const rule: MarginRule = {
      marginType: marginRow.marginType === "percent" ? "percent" : "fixed",
      marginValue: Number(marginRow.marginValue),
      isActive: marginRow.isActive,
    }
    totalTnd = roundTnd(applyMargin(preMargin, rule))
    marginAmount = roundTnd(totalTnd - preMargin)
    marginPercent = rule.marginType === "percent" ? rule.marginValue : undefined
  }

  return {
    rentalDays,
    dailyRateTnd,
    weeklyRateTnd,
    baseTotalTnd,
    insuranceDailyFeeTnd,
    insuranceTotalTnd,
    depositTnd,
    marginPercent,
    marginAmount: marginAmount || undefined,
    totalTnd,
    currency: "TND",
    breakdown: {
      base: baseTotalTnd,
      insurance: insuranceTotalTnd,
      margin: marginAmount,
    },
  }
}
