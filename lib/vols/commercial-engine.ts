/**
 * Commercial Engine — Flight Puzzle
 *
 * Transforms a supplier price into the B2C selling price:
 *   supplierAmount + fee + markup = sellingAmount
 *
 * Priority cascade:
 *   1. DB: query rules where (agency_id IS NULL OR agency_id = X) AND
 *          (channel IS NULL OR channel = Y), ORDER BY priority DESC
 *   2. TypeScript: filter by product_scope (cabin, provider, origin, destination, airline)
 *   3. Take highest-priority matching rule; apply min/max markup constraints
 *   4. Fallback: env-var defaults when no DB rule matches
 *
 * The supplier price is NEVER directly exposed to the frontend.
 */

import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { flightCommercialRules } from "@/lib/db/schema/flights"

export type DistributionChannel = "B2C" | "B2B" | "PARTNER" | "WHITE_LABEL"

export interface ProductHints {
  cabin?: string
  provider?: string
  origin?: string
  destination?: string
  airline?: string
}

export interface CommercialRules {
  fixedFee: number
  markupRate: number
  minMarkup?: number
  maxMarkup?: number
  currency: string
}

export interface CommercialResult {
  supplierAmount: number
  supplierCurrency: string
  fee: number
  markup: number
  sellingAmount: number
  sellingCurrency: string
}

// ---------------------------------------------------------------------------
// Env-var fallback rules
// ---------------------------------------------------------------------------

function getEnvFallbackRules(channel: DistributionChannel): CommercialRules {
  switch (channel) {
    case "B2C":
      return {
        fixedFee: Number(process.env.FLIGHTS_B2C_FIXED_FEE ?? "15"),
        markupRate: Number(process.env.FLIGHTS_B2C_MARKUP_RATE ?? "0.04"),
        currency: "TND",
      }
    case "B2B":
      return {
        fixedFee: Number(process.env.FLIGHTS_B2B_FIXED_FEE ?? "10"),
        markupRate: Number(process.env.FLIGHTS_B2B_MARKUP_RATE ?? "0.025"),
        currency: "TND",
      }
    case "PARTNER":
      return {
        fixedFee: Number(process.env.FLIGHTS_PARTNER_FIXED_FEE ?? "8"),
        markupRate: Number(process.env.FLIGHTS_PARTNER_MARKUP_RATE ?? "0.02"),
        currency: "TND",
      }
    case "WHITE_LABEL":
      return {
        fixedFee: Number(process.env.FLIGHTS_WL_FIXED_FEE ?? "0"),
        markupRate: Number(process.env.FLIGHTS_WL_MARKUP_RATE ?? "0.015"),
        currency: "TND",
      }
  }
}

// ---------------------------------------------------------------------------
// Product scope matching
// ---------------------------------------------------------------------------

export type ProductScope = {
  cabin?: string
  provider?: string
  origin?: string
  destination?: string
  airline?: string
} | null

/** Exported for unit testing. Pure — no I/O. */
export function matchesProductScope(scope: ProductScope, hints: ProductHints): boolean {
  if (!scope) return true // NULL scope = matches all
  if (scope.cabin && hints.cabin && scope.cabin !== hints.cabin) return false
  if (scope.provider && hints.provider && scope.provider !== hints.provider) return false
  if (scope.origin && hints.origin && scope.origin !== hints.origin) return false
  if (scope.destination && hints.destination && scope.destination !== hints.destination) return false
  if (scope.airline && hints.airline && scope.airline !== hints.airline) return false
  return true
}

// ---------------------------------------------------------------------------
// DB lookup — priority cascade
// ---------------------------------------------------------------------------

async function findBestCommercialRule(
  agencyId: string,
  channel: DistributionChannel,
  hints: ProductHints,
): Promise<CommercialRules | null> {
  try {
    const now = new Date()
    const rows = await withSystemContext((tx) =>
      tx
        .select({
          fixedFee: flightCommercialRules.fixedFee,
          markupRate: flightCommercialRules.markupRate,
          minMarkup: flightCommercialRules.minMarkup,
          maxMarkup: flightCommercialRules.maxMarkup,
          currency: flightCommercialRules.currency,
          productScope: flightCommercialRules.productScope,
          priority: flightCommercialRules.priority,
        })
        .from(flightCommercialRules)
        .where(
          and(
            // NULL agency_id = global rule (matches any partner)
            or(isNull(flightCommercialRules.agencyId), eq(flightCommercialRules.agencyId, agencyId)),
            // NULL channel = global rule (matches any channel)
            or(isNull(flightCommercialRules.channel), eq(flightCommercialRules.channel, channel)),
            eq(flightCommercialRules.isActive, true),
            or(
              isNull(flightCommercialRules.validFrom),
              lte(flightCommercialRules.validFrom, now),
            ),
            or(
              isNull(flightCommercialRules.validTo),
              gte(flightCommercialRules.validTo, now),
            ),
          ),
        )
        .orderBy(desc(flightCommercialRules.priority)),
    )

    const list = rows as Array<{
      fixedFee: string
      markupRate: string
      minMarkup: string | null
      maxMarkup: string | null
      currency: string
      productScope: ProductScope
      priority: number
    }>

    // Apply product scope filter in TypeScript (highest-priority first)
    for (const row of list) {
      if (matchesProductScope(row.productScope, hints)) {
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
// Public API
// ---------------------------------------------------------------------------

export async function getCommercialRules(
  agencyId: string,
  channel: DistributionChannel = "B2C",
  hints: ProductHints = {},
): Promise<CommercialRules> {
  const dbRule = await findBestCommercialRule(agencyId, channel, hints)
  return dbRule ?? getEnvFallbackRules(channel)
}

/**
 * Pure arithmetic: apply a resolved CommercialRules object to a supplier price.
 * Exported for unit testing — no I/O, no DB.
 */
export function computeCommercialResult(
  supplierAmount: number,
  supplierCurrency: string,
  rules: CommercialRules,
): CommercialResult {
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

/**
 * Apply commercial rules to a supplier price.
 * All amounts are rounded to 3 decimal places (TND standard).
 */
export async function applyCommercialEngine(
  supplierAmount: number,
  supplierCurrency: string,
  agencyId: string,
  channel: DistributionChannel = "B2C",
  hints: ProductHints = {},
): Promise<CommercialResult> {
  const rules = await getCommercialRules(agencyId, channel, hints)
  return computeCommercialResult(supplierAmount, supplierCurrency, rules)
}
