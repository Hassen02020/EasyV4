/**
 * Classement des offres — jamais un simple tri par prix brut. La mission
 * demande un scoreOffer() configurable ; le comportement par défaut
 * n'altère PAS les règles de pricing commerciales existantes
 * (lib/finance/margin-calculator.ts) — ce module ne fait que CLASSER des
 * NormalizedRate déjà tarifées, il ne recalcule aucun prix.
 */

import type { NormalizedRate } from "./types"

export type RankingStrategy = "LOWEST_PRICE" | "BEST_MARGIN" | "BEST_VALUE" | "PREFERRED_SUPPLIER"

export interface RankingOptions {
  strategy?: RankingStrategy
  /** Utilisé uniquement par PREFERRED_SUPPLIER — ordre de préférence explicite. */
  preferredSupplierOrder?: string[]
}

const CANCELLATION_SCORE: Record<NormalizedRate["cancellationPolicy"]["type"], number> = {
  FREE_CANCELLATION: 1,
  PARTIAL_PENALTY: 0.5,
  UNKNOWN: 0.25,
  FULL_PENALTY: 0,
  NON_REFUNDABLE: 0,
}

/**
 * Score 0..1, plus haut = meilleure offre selon la stratégie choisie.
 * LOWEST_PRICE : uniquement le prix de vente (le comportement historique,
 * conservé comme défaut pour ne rien changer aux règles commerciales
 * existantes sans instruction explicite — voir section 11 de la mission).
 */
export function scoreOffer(
  rate: NormalizedRate,
  allRates: NormalizedRate[],
  options: RankingOptions = {},
): number {
  const strategy = options.strategy ?? "LOWEST_PRICE"
  const prices = allRates.map((r) => r.sellingPrice)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceScore =
    maxPrice === minPrice ? 1 : 1 - (rate.sellingPrice - minPrice) / (maxPrice - minPrice)

  switch (strategy) {
    case "LOWEST_PRICE":
      return priceScore

    case "BEST_MARGIN": {
      const margin = rate.sellingPrice - rate.netPrice
      const margins = allRates.map((r) => r.sellingPrice - r.netPrice)
      const minMargin = Math.min(...margins)
      const maxMargin = Math.max(...margins)
      return maxMargin === minMargin ? 1 : (margin - minMargin) / (maxMargin - minMargin)
    }

    case "PREFERRED_SUPPLIER": {
      const order = options.preferredSupplierOrder ?? []
      const idx = order.indexOf(rate.supplier)
      const preferenceScore = idx === -1 ? 0 : 1 - idx / Math.max(order.length, 1)
      return preferenceScore * 0.7 + priceScore * 0.3
    }

    case "BEST_VALUE":
    default: {
      const cancellationScore = CANCELLATION_SCORE[rate.cancellationPolicy.type] ?? 0.25
      const availabilityScore = rate.availability === "AVAILABLE" || typeof rate.availability === "number" ? 1 : 0.3
      // Pondération volontairement moins price-dominante que LOWEST_PRICE —
      // "meilleure valeur" doit pouvoir préférer une offre légèrement plus
      // chère mais annulable gratuitement à une offre non remboursable.
      return priceScore * 0.35 + cancellationScore * 0.45 + availabilityScore * 0.2
    }
  }
}

export function rankOffers(rates: NormalizedRate[], options: RankingOptions = {}): NormalizedRate[] {
  if (rates.length === 0) return []
  return [...rates].sort((a, b) => scoreOffer(b, rates, options) - scoreOffer(a, rates, options))
}
