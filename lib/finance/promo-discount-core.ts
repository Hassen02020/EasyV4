/**
 * PRICING-PROMO-LINK-01 — applique une remise PROMO déjà résolue
 * (`resolveApplicableDiscountCore`, PROMO-01) à un `salePriceTnd` déjà
 * calculé par le module de réservation appelant. Fonction PURE :
 * jamais d'accès DB, jamais un recalcul de la remise elle-même
 * (PROMO reste l'unique propriétaire de "quelle remise"), jamais une
 * écriture (BOOKING/FINANCIAL restent les seuls écrivains de leurs
 * tables respectives).
 *
 * Audit de conception dédié (docs/ROADMAP.md) : point d'injection
 * unique, identique dans les ~8 modules de réservation — juste avant
 * `recordReservationFinancials` (lib/finance/reservation-financials.ts),
 * jamais avant (ne doit jamais interférer avec le calcul de marge B2B
 * de `lib/pro/pricing.ts`, totalement indépendant) ni après (FINANCIAL
 * reçoit toujours un prix déjà final, inchangé dans son contrat).
 *
 * Arrondi à 2 décimales — PAS 3 comme `applyMargin` (lib/pro/pricing.ts) :
 * `reservations.tndAmount`/`originalAmount` sont `decimal(14,2)`, le
 * niveau réellement persisté en base, jamais un arrondi plus fin sans
 * effet réel.
 *
 * PROMO-LOSS-POLICY-01 : si `supplierPriceTnd` est fourni (hotel/flight/
 * transfer/network — coût fournisseur réel et séparé) et que la remise
 * ramènerait le prix sous ce coût, le plancher s'applique SAUF si
 * `allowBelowCost` (posé par l'agence sur la promo elle-même, jamais
 * déduit ici) l'autorise explicitement. Pour omra/package/activity/car
 * (`supplierPriceTnd` omis par l'appelant — aucun coût séparé n'existe,
 * jamais inventé ici), le plancher ne s'applique jamais : il n'y a rien
 * à plafonner.
 */

import type { ApplicableDiscountResult } from "@/lib/crm/promo-core"

export type ApplyPromoDiscountResult =
  | { finalPriceTnd: number; discountApplied: true }
  | { finalPriceTnd: number; discountApplied: false; reason: "NOT_APPLICABLE" }

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * `supplierPriceTnd` omis (undefined) = module sans coût fournisseur
 * séparé (omra/package/activity/car) — jamais fabriqué ici, jamais de
 * plancher appliqué dans ce cas.
 */
export function applyPromoDiscountCore(
  salePriceTnd: number,
  discount: ApplicableDiscountResult,
  params: { supplierPriceTnd?: number } = {},
): ApplyPromoDiscountResult {
  if (!discount.applicable) {
    return {
      finalPriceTnd: round2(salePriceTnd),
      discountApplied: false,
      reason: "NOT_APPLICABLE",
    }
  }

  const value = Number(discount.discountValue)
  const discounted =
    discount.discountType === "percent"
      ? salePriceTnd * (1 - value / 100)
      : salePriceTnd - value

  const flooredAtZero = Math.max(discounted, 0)

  const final =
    params.supplierPriceTnd !== undefined && !discount.allowBelowCost
      ? Math.max(flooredAtZero, params.supplierPriceTnd)
      : flooredAtZero

  return { finalPriceTnd: round2(final), discountApplied: true }
}
