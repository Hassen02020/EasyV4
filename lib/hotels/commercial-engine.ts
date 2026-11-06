/**
 * COMMERCIAL-HOTELS-01 — Moteur de règles commerciales DB-driven pour hôtels
 *
 * Miroir de lib/vols/commercial-engine.ts appliqué aux hôtels TN + Monde.
 *
 * Cascade de priorité :
 *   1. DB : hotel_commercial_rules WHERE (agency_id IS NULL OR agency_id = X)
 *           AND (channel IS NULL OR channel = Y), ORDER BY priority DESC
 *   2. TypeScript : filter par productScope { destination?, provider?, stars?, board_basis? }
 *   3. Règle de priorité max retenue ; constraints min/max markup appliquées
 *   4. Fallback : pricing_margins (comportement existant, préservé)
 *
 * Invariant : le prix fournisseur n'est JAMAIS exposé directement au frontend.
 */

import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { hotelCommercialRules } from "@/lib/db/schema/hotel-suppliers"
import { applyMargin, type MarginRule } from "@/lib/pro/pricing"

export type HotelDistributionChannel = "B2C" | "B2B" | "PARTNER" | "WHITE_LABEL"

export interface HotelProductHints {
  destination?: string
  provider?: string
  stars?: number
  boardBasis?: string
}

export interface HotelCommercialRules {
  fixedFee: number
  markupRate: number
  minMarkup?: number
  maxMarkup?: number
  currency: string
}

export interface HotelCommercialResult {
  supplierAmount: number
  supplierCurrency: string
  fee: number
  markup: number
  sellingAmount: number
  sellingCurrency: string
}

// ---------------------------------------------------------------------------
// Product scope matching — pure, no I/O
// ---------------------------------------------------------------------------

export type HotelProductScope = {
  destination?: string
  provider?: string
  stars?: number
  boardBasis?: string
} | null

export function matchesHotelProductScope(
  scope: HotelProductScope,
  hints: HotelProductHints,
): boolean {
  if (!scope) return true
  if (
    scope.destination &&
    hints.destination &&
    scope.destination !== hints.destination
  )
    return false
  if (scope.provider && hints.provider && scope.provider !== hints.provider)
    return false
  if (
    scope.stars !== undefined &&
    hints.stars !== undefined &&
    scope.stars !== hints.stars
  )
    return false
  if (
    scope.boardBasis &&
    hints.boardBasis &&
    scope.boardBasis !== hints.boardBasis
  )
    return false
  return true
}

// ---------------------------------------------------------------------------
// DB lookup — priority cascade
// ---------------------------------------------------------------------------

async function findBestHotelCommercialRule(
  agencyId: string,
  channel: HotelDistributionChannel,
  hints: HotelProductHints,
): Promise<HotelCommercialRules | null> {
  try {
    const now = new Date()
    const rows = await withSystemContext((tx) =>
      tx
        .select({
          fixedFee: hotelCommercialRules.fixedFee,
          markupRate: hotelCommercialRules.markupRate,
          minMarkup: hotelCommercialRules.minMarkup,
          maxMarkup: hotelCommercialRules.maxMarkup,
          currency: hotelCommercialRules.currency,
          productScope: hotelCommercialRules.productScope,
          priority: hotelCommercialRules.priority,
        })
        .from(hotelCommercialRules)
        .where(
          and(
            or(
              isNull(hotelCommercialRules.agencyId),
              eq(hotelCommercialRules.agencyId, agencyId),
            ),
            or(
              isNull(hotelCommercialRules.channel),
              eq(hotelCommercialRules.channel, channel),
            ),
            eq(hotelCommercialRules.isActive, true),
            or(
              isNull(hotelCommercialRules.validFrom),
              lte(hotelCommercialRules.validFrom, now),
            ),
            or(
              isNull(hotelCommercialRules.validTo),
              gte(hotelCommercialRules.validTo, now),
            ),
          ),
        )
        .orderBy(desc(hotelCommercialRules.priority)),
    )

    const list = rows as Array<{
      fixedFee: string
      markupRate: string
      minMarkup: string | null
      maxMarkup: string | null
      currency: string
      productScope: HotelProductScope
      priority: number
    }>

    for (const row of list) {
      if (matchesHotelProductScope(row.productScope, hints)) {
        return {
          fixedFee: Number(row.fixedFee),
          markupRate: Number(row.markupRate),
          minMarkup: row.minMarkup != null ? Number(row.minMarkup) : undefined,
          maxMarkup: row.maxMarkup != null ? Number(row.maxMarkup) : undefined,
          currency: row.currency,
        }
      }
    }
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Pure arithmetic — exported for unit tests
// ---------------------------------------------------------------------------

export function computeHotelCommercialResult(
  supplierAmount: number,
  supplierCurrency: string,
  rules: HotelCommercialRules,
): HotelCommercialResult {
  if (supplierCurrency !== rules.currency) {
    throw new Error(
      `Hotel commercial engine: supplier currency "${supplierCurrency}" ≠ rule currency "${rules.currency}" — aucune conversion FX câblée (CURRENCY-DIM-01)`,
    )
  }

  const fee = Math.round(rules.fixedFee * 1000) / 1000
  let markup = Math.round(supplierAmount * rules.markupRate * 1000) / 1000

  if (rules.minMarkup !== undefined && markup < rules.minMarkup) {
    markup = Math.round(rules.minMarkup * 1000) / 1000
  }
  if (rules.maxMarkup !== undefined && markup > rules.maxMarkup) {
    markup = Math.round(rules.maxMarkup * 1000) / 1000
  }

  return {
    supplierAmount,
    supplierCurrency,
    fee,
    markup,
    sellingAmount: Math.round((supplierAmount + fee + markup) * 1000) / 1000,
    sellingCurrency: rules.currency,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Résout les règles commerciales pour un hôtel et un canal donné.
 * Retourne null si aucune règle DB ne correspond (le caller utilise alors
 * le fallback pricing_margins existant).
 */
export async function resolveHotelCommercialRules(
  agencyId: string,
  channel: HotelDistributionChannel,
  hints: HotelProductHints = {},
): Promise<HotelCommercialRules | null> {
  return findBestHotelCommercialRule(agencyId, channel, hints)
}

/**
 * Applique le moteur commercial hôtel si une règle DB existe.
 * Retourne null si aucune règle — le caller applique alors pricing_margins.
 */
export async function applyHotelCommercialEngine(
  supplierAmount: number,
  supplierCurrency: string,
  agencyId: string,
  channel: HotelDistributionChannel = "B2C",
  hints: HotelProductHints = {},
): Promise<HotelCommercialResult | null> {
  const rules = await resolveHotelCommercialRules(agencyId, channel, hints)
  if (!rules) return null
  return computeHotelCommercialResult(supplierAmount, supplierCurrency, rules)
}

// ---------------------------------------------------------------------------
// PRICING-HOTEL-TRUTH-01 — tarificateur unique hôtel (affichage = facturation)
// ---------------------------------------------------------------------------

export type HotelPriceSource = "commercial_rule" | "margin"

export interface HotelAgencyPricer {
  /** Origine du prix : règle commerciale DB, sinon marge `pricing_margins`. */
  source: HotelPriceSource
  rules: HotelCommercialRules | null
  marginRule: MarginRule
  /** Prix net fournisseur (TND, HT) → prix agence (TND, HT). */
  price: (netTnd: number) => number
}

/**
 * Fonction pure : la SEULE formule du prix agence d'un hôtel Tunisie.
 * Règle commerciale si elle existe (frais + markup borné), sinon marge
 * `pricing_margins` (applyMargin). Utilisée par la recherche publique,
 * l'espace Pro ET les deux réservations (B2C, B2B) — jamais deux formules.
 * Tout est en TND : une règle dans une autre devise est refusée par
 * computeHotelCommercialResult (CURRENCY-DIM-01), jamais convertie.
 */
export function makeHotelAgencyPricer(
  rules: HotelCommercialRules | null,
  marginRule: MarginRule,
): HotelAgencyPricer {
  return {
    source: rules ? "commercial_rule" : "margin",
    rules,
    marginRule,
    price: rules
      ? (netTnd) =>
          computeHotelCommercialResult(netTnd, "TND", rules).sellingAmount
      : (netTnd) => applyMargin(netTnd, marginRule),
  }
}

/**
 * Résout une fois les règles pour (agence, canal) puis renvoie le
 * tarificateur. `agencyId` null (aucune agence résolue) → marge seule.
 */
export async function resolveHotelAgencyPricer(
  agencyId: string | null,
  channel: HotelDistributionChannel,
  marginRule: MarginRule,
  hints: HotelProductHints = {},
): Promise<HotelAgencyPricer> {
  const rules = agencyId
    ? await resolveHotelCommercialRules(agencyId, channel, hints)
    : null
  return makeHotelAgencyPricer(rules, marginRule)
}
