/**
 * Transfers Pricing — Module Transferts (Sprint 3B)
 *
 * Calcule le coût des trajets à partir de catalog_transfer_pricing.
 *
 * Règles :
 *   - Prix de base depuis catalog_transfer_pricing (par paire de zones × véhicule)
 *   - Majoration nuit (21h-6h) au taux configuré sur la ligne de tarif
 *     (nightSurchargePercent), pas un taux générique
 *   - Application de la marge agence réelle (pricingMargins, module='transfer')
 *
 * "use server" : ce module interroge Drizzle/postgres et est importé depuis
 * des Client Components (TransferBookingForm) — sans cette directive le code
 * Node-only se retrouverait bundlé côté navigateur (même classe de bug que
 * lib/reporting/margin-analytics.ts).
 */
"use server"

import { and, eq } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import {
  catalogTransferPricing,
  pricingMargins,
  transferVehicleType,
} from "@/lib/db/schema"
import { applyMargin, type MarginRule } from "@/lib/pro/pricing"

/** Type union des valeurs possibles pour un véhicule de transfert. */
export type TransferVehicleType = (typeof transferVehicleType.enumValues)[number]

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface TransferPricingInput {
  fromZoneId: string
  toZoneId: string
  vehicleType: TransferVehicleType
  pickupDate: string // YYYY-MM-DD
  pickupTime: string // HH:MM (local time)
  agencyId: string
}

export interface TransferPricingResult {
  basePriceTnd: number
  nightSurchargePercent: number
  nightSurchargeAmount: number
  marginPercent?: number
  marginAmount?: number
  totalTnd: number
  currency: string
  breakdown: {
    base: number
    surcharge: number
    margin: number
  }
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Plage horaire nuit (21h-6h) pour majoration */
const NIGHT_START_HOUR = 21
const NIGHT_END_HOUR = 6

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Détermine si l'heure donnée est dans la plage de nuit (21h-6h).
 */
function isNightTime(time: string): boolean {
  const hour = parseInt(time.split(":")[0], 10)
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR
}

/**
 * Arrondit à 3 décimales (millimes TND).
 */
function roundTnd(value: number): number {
  return Math.round(value * 1000) / 1000
}

/* -------------------------------------------------------------------------- */
/* Main Function                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Calcule le prix d'un transfert à partir du tarif réel configuré pour la
 * paire de zones et le véhicule demandés.
 *
 * Retourne `null` si aucun tarif n'est configuré pour cet itinéraire —
 * l'appelant doit traiter ce cas explicitement (jamais de prix inventé,
 * cf. règle anti-fabrication du produit).
 */
export async function calculateTransferPrice(
  input: TransferPricingInput,
): Promise<TransferPricingResult | null> {
  const db = getDb()

  const [rate] = await db
    .select()
    .from(catalogTransferPricing)
    .where(
      and(
        eq(catalogTransferPricing.fromZoneId, input.fromZoneId),
        eq(catalogTransferPricing.toZoneId, input.toZoneId),
        eq(catalogTransferPricing.vehicleType, input.vehicleType),
      ),
    )
    .limit(1)

  if (!rate) return null

  const basePriceTnd = Number(rate.basePriceTnd)
  const nightSurchargePercent = isNightTime(input.pickupTime)
    ? rate.nightSurchargePercent
    : 0
  const nightSurchargeAmount = roundTnd(
    (basePriceTnd * nightSurchargePercent) / 100,
  )
  const preMargin = basePriceTnd + nightSurchargeAmount

  const [marginRow] = await db
    .select()
    .from(pricingMargins)
    .where(
      and(
        eq(pricingMargins.agencyId, input.agencyId),
        eq(pricingMargins.module, "transfer"),
        eq(pricingMargins.isActive, true),
      ),
    )
    .limit(1)

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
    basePriceTnd,
    nightSurchargePercent,
    nightSurchargeAmount,
    marginPercent,
    marginAmount: marginAmount || undefined,
    totalTnd,
    currency: "TND",
    breakdown: {
      base: basePriceTnd,
      surcharge: nightSurchargeAmount,
      margin: marginAmount,
    },
  }
}
