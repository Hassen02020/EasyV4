/**
 * Commercial Engine — Flight Puzzle
 *
 * Transforms a supplier price into the B2C selling price:
 *   supplierAmount + fee + markup = sellingAmount
 *
 * Rules are per-channel (B2C / B2B / Partner / WhiteLabel) and per-agency.
 * Today only the B2C channel is implemented; other channels follow the same
 * interface without changing any upstream or downstream code.
 *
 * The supplier price is NEVER directly exposed to the frontend — only the
 * selling price and the snapshot ID are returned to the client.
 */

export type DistributionChannel = "B2C" | "B2B" | "PARTNER" | "WHITE_LABEL"

export interface CommercialRules {
  /** Fixed fee per booking in supplier currency. */
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

/**
 * Load commercial rules for a given agency + channel.
 * Reads from env vars for now; a future version will query the DB per-agency.
 */
export function getCommercialRules(
  _agencyId: string,
  channel: DistributionChannel = "B2C",
): CommercialRules {
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

/**
 * Apply commercial rules to a supplier price.
 * All amounts are rounded to 3 decimal places (TND standard).
 */
export function applyCommercialEngine(
  supplierAmount: number,
  supplierCurrency: string,
  agencyId: string,
  channel: DistributionChannel = "B2C",
): CommercialResult {
  const rules = getCommercialRules(agencyId, channel)
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
