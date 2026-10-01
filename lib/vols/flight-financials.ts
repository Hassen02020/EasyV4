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
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"

export async function finalizeFlightBookingFinancials(
  tx: DrizzleTransaction,
  input: { reservationId: string; snapshotId: string | null },
): Promise<void> {
  if (!input.snapshotId) return

  const [snapshot] = await tx
    .select({
      supplierAmount: flightPriceSnapshots.supplierAmount,
      sellingAmount: flightPriceSnapshots.sellingAmount,
    })
    .from(flightPriceSnapshots)
    .where(eq(flightPriceSnapshots.id, input.snapshotId))
    .limit(1)

  if (!snapshot) return

  const supplierPriceTnd = Number(snapshot.supplierAmount)
  const salePriceTnd = Number(snapshot.sellingAmount)

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
