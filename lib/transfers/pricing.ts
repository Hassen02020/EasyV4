/**
 * Transfers Pricing — Module Transferts (Sprint 3B)
 *
 * Calcule le coût des trajets à partir de catalog_transfer_pricing.
 *
 * Règles :
 *   - Prix de base depuis catalog_transfer_pricing
 *   - Majoration automatique 20% pour les trajets de nuit (21h-6h)
 *   - Surcharge configurable par ligne (nightSurchargePercent)
 *   - Application de la marge agence (pricingMargins) si configurée
 */

import { transferVehicleType } from "@/lib/db/schema"

/** Type union des valeurs possibles pour un véhicule de transfert. */
export type TransferVehicleType = typeof transferVehicleType.enumValues[number]

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

/** Plage horaire nuit (21h-6h) pour majoration automatique */
const NIGHT_START_HOUR = 21
const NIGHT_END_HOUR = 6

/** Majoration automatique nuit par défaut (20%) */
const DEFAULT_NIGHT_SURCHARGE = 20

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
 * Calcule le prix d'un transfert.
 *
 * TODO : Intégrer avec la base de données pour récupérer :
 *   - catalog_transfer_pricing (prix de base + surcharge configurée)
 *   - pricingMargins (marge agence)
 *
 * Pour l'instant, retourne un calcul stub.
 */
export function calculateTransferPrice(
  input: TransferPricingInput,
): TransferPricingResult {
  const { pickupTime, vehicleType } = input

  // --- 1. Prix de base (stub — à remplacer par DB) ---
  const basePriceByVehicle: Record<TransferVehicleType, number> = {
    sedan: 50,
    van: 80,
    minibus: 120,
    bus: 200,
    luxury: 150,
  }
  const basePriceTnd = basePriceByVehicle[vehicleType] ?? 50

  // --- 2. Surcharge nuit ---
  const isNight = isNightTime(pickupTime)
  const nightSurchargePercent = isNight ? DEFAULT_NIGHT_SURCHARGE : 0
  const nightSurchargeAmount = roundTnd(
    (basePriceTnd * nightSurchargePercent) / 100,
  )

  // --- 3. Marge agence (stub — à remplacer par DB) ---
  const marginPercent = 0 // TODO : depuis pricingMargins
  const marginAmount = roundTnd(
    ((basePriceTnd + nightSurchargeAmount) * marginPercent) / 100,
  )

  // --- 4. Total ---
  const totalTnd = roundTnd(
    basePriceTnd + nightSurchargeAmount + marginAmount,
  )

  return {
    basePriceTnd,
    nightSurchargePercent,
    nightSurchargeAmount,
    marginPercent: marginPercent || undefined,
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

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Valide que l'heure de prise en charge est dans un format valide.
 */
export function validatePickupTime(time: string): boolean {
  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return false
  const hour = parseInt(match[1], 10)
  const minute = parseInt(match[2], 10)
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}
