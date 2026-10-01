"use server"

/**
 * PROVIDER-CONNECTIVITY-BRIDGE (P3) : point d'ancrage financier UNIQUE pour
 * une réservation vol confirmée, quel que soit le canal (API_DIRECT ou
 * B2B_OFFLINE).
 *
 * Audit préalable (chantier PROVIDER-CONNECTIVITY-BRIDGE) : le pipeline vol
 * réellement actif (booking-request-action.ts → fulfillment-action.ts →
 * flight-status-sync.ts) n'appelait `recordReservationFinancials` NULLE
 * PART — seul l'ancien fichier mort (guest-booking-actions.ts, aucun
 * appelant UI) le faisait. Résultat : aucune réservation vol confirmée via
 * le pipeline réel n'alimentait le Dashboard Marges. Cette fonction
 * restaure cet ancrage, appelée UNE SEULE FOIS par réservation, depuis les
 * DEUX chemins de confirmation (fulfillFlightBooking et
 * confirmManualFlightBooking) — jamais les deux pour la même réservation,
 * garanti par le CAS `flight_bookings.status='PENDING'` qu'un seul des deux
 * peut gagner.
 *
 * Ne calcule rien de nouveau : lit le snapshot déjà figé
 * (supplierAmount/sellingAmount, calculés par commercial-engine.ts au
 * moment de la recherche), jamais un recalcul ici.
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { flightPriceSnapshots } from "@/lib/db/schema/flights"
import { reservations } from "@/lib/db/schema"
import { recordReservationFinancials, type RecordReservationFinancialsInput } from "@/lib/finance/reservation-financials"
import { fetchExchangeRateForBooking, ExchangeRateUnavailableError } from "@/lib/finance/exchange-rate"

export async function finalizeFlightBookingFinancials(
  tx: DrizzleTransaction,
  input: { reservationId: string; snapshotId: string | null },
): Promise<void> {
  if (!input.snapshotId) return

  const [snapshot] = await tx
    .select({
      supplierAmount: flightPriceSnapshots.supplierAmount,
      sellingAmount: flightPriceSnapshots.sellingAmount,
      supplierCurrency: flightPriceSnapshots.supplierCurrency,
    })
    .from(flightPriceSnapshots)
    .where(eq(flightPriceSnapshots.id, input.snapshotId))
    .limit(1)

  if (!snapshot) return

  const supplierOriginalAmount = Number(snapshot.supplierAmount)
  const salePriceTnd = Number(snapshot.sellingAmount)
  const supplierCurrency = snapshot.supplierCurrency ?? "TND"

  // CURRENCY-DIM-01 : si le fournisseur a facturé dans une devise ≠ TND,
  // on obtient un taux frais au moment du booking (D2 Option B — jamais le
  // taux de search) et on transmet l'original + le taux à
  // recordReservationFinancials pour alimenter supplier_currency /
  // exchange_rate / exchange_rate_at. Sans clé ou provider indisponible :
  // ExchangeRateUnavailableError → on laisse remonter (fail closed).
  // Aujourd'hui supplierCurrency est toujours "TND" (commercial engine
  // bloque les autres devises via UnsupportedCommercialCurrencyMismatchError)
  // — ce bloc est inerte mais câblé pour Duffel et tout futur GDS.
  let supplierPriceTnd = supplierOriginalAmount
  const financialExtra: Partial<RecordReservationFinancialsInput> = {}

  if (supplierCurrency !== "TND") {
    const rate = await fetchExchangeRateForBooking(supplierCurrency, "TND")
    supplierPriceTnd = Math.round(supplierOriginalAmount * rate.rate * 100) / 100
    financialExtra.supplierOriginal = { amount: supplierOriginalAmount, currency: supplierCurrency }
    financialExtra.exchangeRate = { rate: rate.rate, at: rate.capturedAt }
  }

  // ECON-WIRING-01 — economic_entitlements. Fournisseur réel externe (API
  // vols), non modélisé — external_supplier/partyId null, comme les autres
  // modules à fournisseur externe. Lecture de agencyId (non fourni par les
  // deux appelants aujourd'hui) — simple SELECT dans la même transaction,
  // aucun changement de comportement du calcul financier lui-même.
  const [reservation] = await tx
    .select({ agencyId: reservations.agencyId })
    .from(reservations)
    .where(eq(reservations.id, input.reservationId))
    .limit(1)

  await recordReservationFinancials({
    tx,
    reservationId: input.reservationId,
    supplierPriceTnd,
    salePriceTnd,
    ...financialExtra,
    economicEntitlements: reservation
      ? [
          {
            partyType: "external_supplier",
            partyId: null,
            role: "supplier",
            qualification: "supplier_cost",
            amount: supplierPriceTnd,
            basis: "coût fournisseur réel figé au moment de la recherche (flight_price_snapshots.supplier_amount)",
          },
          {
            partyType: "agency",
            partyId: reservation.agencyId,
            role: "seller",
            qualification: "seller_margin",
            amount: salePriceTnd - supplierPriceTnd,
            basis: "marge vendeur (aucune commission Easy2Book aujourd'hui sur ce module)",
          },
        ]
      : undefined,
  })
}
