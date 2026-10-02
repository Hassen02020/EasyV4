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
import {
  recordReservationFinancials,
  type RecordReservationFinancialsInput,
} from "@/lib/finance/reservation-financials"
import {
  fetchExchangeRateForBooking,
  ExchangeRateUnavailableError,
} from "@/lib/finance/exchange-rate"
import {
  getActiveFxPolicy,
  applyFxCorrection,
  computeBankFeeContribution,
  FxPolicyUnavailableError,
} from "@/lib/finance/fx-policy"

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

  // CURRENCY-DIM-01 + CURRENCY-DIM-02 : si le fournisseur facture dans une
  // devise ≠ TND, on obtient :
  //   1. Le taux de référence mid-market (fetchExchangeRateForBooking — D2 Option B)
  //   2. La politique FX active (getActiveFxPolicy — CURRENCY-DIM-02)
  //   3. Le taux appliqué = référence + correction banque (applyFxCorrection)
  //   4. Le frais bancaire proratisé (computeBankFeeContribution)
  //
  // Fail-closed sur les deux : ExchangeRateUnavailableError ou
  // FxPolicyUnavailableError remontent tels quels → booking annulé proprement.
  //
  // Aujourd'hui supplierCurrency est toujours "TND" (commercial engine
  // bloque les autres devises via UnsupportedCommercialCurrencyMismatchError)
  // — ce bloc est inerte mais câblé pour Duffel et tout futur GDS.
  let supplierPriceTnd = supplierOriginalAmount
  const financialExtra: Partial<RecordReservationFinancialsInput> = {}
  let bankFeeTnd = 0

  if (supplierCurrency !== "TND") {
    const referenceRate = await fetchExchangeRateForBooking(
      supplierCurrency,
      "TND",
    )
    const policy = await getActiveFxPolicy()
    const applied = applyFxCorrection(referenceRate, policy)

    supplierPriceTnd =
      Math.round(supplierOriginalAmount * applied.appliedRate * 100) / 100
    bankFeeTnd = computeBankFeeContribution(
      supplierOriginalAmount,
      applied.appliedRate,
      policy,
    )

    financialExtra.supplierOriginal = {
      amount: supplierOriginalAmount,
      currency: supplierCurrency,
    }
    financialExtra.exchangeRate = {
      rate: referenceRate.rate,
      at: referenceRate.capturedAt,
    }
    financialExtra.appliedRate = applied
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
            basis:
              "coût fournisseur réel figé au moment de la recherche (flight_price_snapshots.supplier_amount)",
          },
          {
            partyType: "agency",
            partyId: reservation.agencyId,
            role: "seller",
            qualification: "seller_margin",
            amount: salePriceTnd - supplierPriceTnd,
            basis:
              "marge vendeur (aucune commission Easy2Book aujourd'hui sur ce module)",
          },
          // CURRENCY-DIM-02 : estimation proratisée du frais bancaire FX, uniquement
          // si supplierCurrency ≠ TND et si la politique FX définit un frais > 0.
          // Ligne informative (coût absorbé par Easy2Book) — n'affecte ni salePriceTnd
          // ni le montant facturé à l'agence. L'allocation réelle d'un virement
          // multi-bookings reste pour BANK-RECONCILE-01.
          ...(bankFeeTnd > 0
            ? [
                {
                  partyType: "easy2book",
                  partyId: null,
                  role: "easy2book" as const,
                  qualification: "platform_fee" as const,
                  amount: -bankFeeTnd,
                  basis: `frais bancaire FX (CURRENCY-DIM-02, politique version ${financialExtra.appliedRate?.policyVersion ?? "?"})`,
                },
              ]
            : []),
        ]
      : undefined,
  })
}
