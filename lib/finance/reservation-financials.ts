/**
 * Enregistrement coût fournisseur ↔ prix de vente ↔ marge pour une
 * réservation — alimente `reservation_financials`, la table lue par le
 * Dashboard Marges (`lib/reporting/margin-analytics-core.ts`).
 *
 * Trouvé en audit (lot Financial/Margin Analytics) : cette table existe
 * depuis longtemps (schéma complet : coût, vente, marge, devise, taux de
 * change) mais n'était jamais écrite — son seul rédacteur
 * (`lib/finance/wallet-service.ts`, via `lib/booking/workflow-pipeline.ts`)
 * n'est lui-même jamais appelé par le flux de réservation réel (déjà
 * documenté dans `lib/pro/margins-core.ts`). Résultat : `/admin/analytics/
 * margins` affiche 0 sur toute la période, quel que soit le volume réel de
 * réservations confirmées.
 *
 * Cette fonction ne calcule RIEN de nouveau — elle enregistre les DEUX
 * montants déjà calculés par le flux de réservation réel via
 * `applyMargin()`/`getMarginsForAgency()` (jamais une deuxième formule) :
 * le prix net fournisseur confirmé par myGo (`myGoBooking.totalPrice`) et
 * le prix agence après marge (`applyMargin(...)`), tous deux HT — la marge
 * ne porte jamais sur la TVA, qui est un simple flux vers l'État, pas un
 * revenu. Appelée dans la MÊME transaction que la création de la
 * réservation, comme les autres écritures liées (audit, débit).
 */

import type { DrizzleTransaction } from "@/lib/db/client"
import { reservationFinancials } from "@/lib/db/schema"

export interface RecordReservationFinancialsInput {
  tx: DrizzleTransaction
  reservationId: string
  /** Coût net fournisseur (HT), déjà confirmé par le fournisseur — jamais une estimation. */
  supplierPriceTnd: number
  /** Prix agence après marge (HT) — sortie de `applyMargin()`, jamais recalculé ici. */
  salePriceTnd: number
}

export async function recordReservationFinancials(
  input: RecordReservationFinancialsInput,
): Promise<void> {
  const { tx, reservationId, supplierPriceTnd, salePriceTnd } = input
  const marginAmount = salePriceTnd - supplierPriceTnd
  const marginPercent = supplierPriceTnd > 0 ? (marginAmount / supplierPriceTnd) * 100 : 0

  await tx.insert(reservationFinancials).values({
    reservationId,
    supplierPrice: supplierPriceTnd.toFixed(2),
    supplierCurrency: "TND",
    supplierPriceTnd: supplierPriceTnd.toFixed(2),
    salePrice: salePriceTnd.toFixed(2),
    saleCurrency: "TND",
    salePriceTnd: salePriceTnd.toFixed(2),
    marginAmount: marginAmount.toFixed(2),
    marginPercent: marginPercent.toFixed(2),
  })
}
