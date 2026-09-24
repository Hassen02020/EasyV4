/**
 * Commercial Engine — Flight Puzzle
 *
 * Transforms a supplier price into the B2C selling price:
 *   supplierAmount + fee + markup = sellingAmount
 *
 * Rules are per-channel (B2C / B2B / Partner / WhiteLabel) and per-agency.
 * G6: Rules are now loaded from the DB (flight_commercial_rules table),
 * with automatic fallback to env vars when no active DB rule is found.
 *
 * The supplier price is NEVER directly exposed to the frontend — only the
 * selling price and the snapshot ID are returned to the client.
 */

import { eq, and, or, isNull, lte, gte, desc } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { flightCommercialRules } from "@/lib/db/schema/flights"

export type DistributionChannel = "B2C" | "B2B" | "PARTNER" | "WHITE_LABEL"

export interface CommercialRules {
  /** Fixed fee per booking in selling currency. */
  fixedFee: number
  /** Markup as a decimal fraction, e.g. 0.05 = 5 %. */
  markupRate: number
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
// Env-var fallback rules (safe defaults when DB has no active rule)
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
// DB lookup (G6)
// ---------------------------------------------------------------------------

async function getDBCommercialRules(
  agencyId: string,
  channel: DistributionChannel,
): Promise<CommercialRules | null> {
  try {
    const now = new Date()
    const rows = await withSystemContext((tx) =>
      tx
        .select({
          fixedFee: flightCommercialRules.fixedFee,
          markupRate: flightCommercialRules.markupRate,
          currency: flightCommercialRules.currency,
        })
        .from(flightCommercialRules)
        .where(
          and(
            eq(flightCommercialRules.agencyId, agencyId),
            eq(flightCommercialRules.channel, channel),
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
        .orderBy(desc(flightCommercialRules.createdAt))
        .limit(1),
    )

    const list = rows as Array<{ fixedFee: string; markupRate: string; currency: string }>
    if (list.length === 0) return null

    return {
      fixedFee: Number(list[0].fixedFee),
      markupRate: Number(list[0].markupRate),
      currency: list[0].currency,
    }
  } catch {
    // DB unavailable — fall through to env-var fallback
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load commercial rules for a given agency + channel.
 * DB row takes precedence; falls back to env vars.
 */
export async function getCommercialRules(
  agencyId: string,
  channel: DistributionChannel = "B2C",
): Promise<CommercialRules> {
  const dbRules = await getDBCommercialRules(agencyId, channel)
  return dbRules ?? getEnvFallbackRules(channel)
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
): Promise<CommercialResult> {
  const rules = await getCommercialRules(agencyId, channel)
  const markup = Math.round(supplierAmount * rules.markupRate * 1000) / 1000
  const fee = Math.round(rules.fixedFee * 1000) / 1000
  const sellingAmount = Math.round((supplierAmount + fee + markup) * 1000) / 1000

  return {
    supplierAmount,
    supplierCurrency,
    fee,
    markup,
    sellingAmount,
    sellingCurrency: rules.currency,
  }
}
