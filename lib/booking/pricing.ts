/**
 * Pricing pur — calcul du sous-total, TVA, frais de service, total TTC,
 * acompte et solde. Pas d'I/O, pas d'effets de bord ⇒ testable à 100 %.
 *
 * Convention : tous les montants sont stockés en TND (devise comptable
 * tunisienne) avec 2 décimales. Si la devise affichée au client diffère,
 * on convertit dans la couche au-dessus (UI / Server Action).
 */

export type RatePayload = {
  /** Prix unitaire HT par occupant (adulte). Doit être ≥ 0. */
  unitPriceTnd: number
  /** Nombre d'adultes. ≥ 1. */
  adults: number
  /** Nombre d'enfants. ≥ 0. */
  children?: number
  /** Tarif enfant (≥ 0). Si absent, on considère 50 % de l'adulte. */
  unitChildPriceTnd?: number
  /** Taux de TVA en pourcentage (ex. 19 pour 19 %). Défaut 19. */
  vatRate?: number
  /** Frais de service fixes (TND). Défaut 0. */
  serviceFeeTnd?: number
  /** Pourcentage d'acompte exigé à la réservation. Défaut 30. */
  depositPercent?: number
}

export type PriceBreakdown = {
  subtotalTnd: number
  vatTnd: number
  serviceFeeTnd: number
  totalTnd: number
  depositTnd: number
  balanceTnd: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Calcule le breakdown complet pour une réservation.
 *
 * Règles métier :
 *  - sous-total HT = adultes × prixAdulte + enfants × prixEnfant
 *  - prix enfant : par défaut 50 % du prix adulte si non fourni
 *  - TVA = sous-total × tauxTVA
 *  - frais de service ne sont pas taxés
 *  - total TTC = sous-total + TVA + frais
 *  - acompte = total × depositPercent / 100
 *  - solde = total − acompte (≥ 0)
 *
 * Throws si une valeur d'entrée est invalide (NaN, négative, etc.).
 */
export function computePriceBreakdown(input: RatePayload): PriceBreakdown {
  const {
    unitPriceTnd,
    adults,
    children = 0,
    unitChildPriceTnd,
    vatRate = 19,
    serviceFeeTnd = 0,
    depositPercent = 30,
  } = input

  if (!Number.isFinite(unitPriceTnd) || unitPriceTnd < 0) {
    throw new Error("unitPriceTnd must be a finite non-negative number")
  }
  if (!Number.isInteger(adults) || adults < 1) {
    throw new Error("adults must be an integer >= 1")
  }
  if (!Number.isInteger(children) || children < 0) {
    throw new Error("children must be an integer >= 0")
  }
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    throw new Error("vatRate must be between 0 and 100")
  }
  if (!Number.isFinite(serviceFeeTnd) || serviceFeeTnd < 0) {
    throw new Error("serviceFeeTnd must be >= 0")
  }
  if (
    !Number.isFinite(depositPercent) ||
    depositPercent < 0 ||
    depositPercent > 100
  ) {
    throw new Error("depositPercent must be between 0 and 100")
  }

  const childPrice =
    unitChildPriceTnd !== undefined ? unitChildPriceTnd : unitPriceTnd * 0.5
  if (!Number.isFinite(childPrice) || childPrice < 0) {
    throw new Error("unitChildPriceTnd must be >= 0")
  }

  const subtotalTnd = round2(adults * unitPriceTnd + children * childPrice)
  const vatTnd = round2((subtotalTnd * vatRate) / 100)
  const totalTnd = round2(subtotalTnd + vatTnd + serviceFeeTnd)
  const depositTnd = round2((totalTnd * depositPercent) / 100)
  const balanceTnd = round2(totalTnd - depositTnd)

  return {
    subtotalTnd,
    vatTnd,
    serviceFeeTnd: round2(serviceFeeTnd),
    totalTnd,
    depositTnd,
    balanceTnd,
  }
}

/**
 * Convertit un montant TND vers une autre devise (au taux fourni).
 * Si `rate` est <= 0 ou non fini, renvoie le montant TND original.
 */
export function convertFromTnd(amountTnd: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return amountTnd
  return round2(amountTnd / rate)
}

/**
 * Format français : 1 234,50 TND
 */
export function formatMoney(amount: number, currency = "TND"): string {
  if (!Number.isFinite(amount)) return `0 ${currency}`
  return `${amount.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency}`
}
