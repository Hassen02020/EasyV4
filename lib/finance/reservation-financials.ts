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
 *
 * ECON-BREAKDOWN-01 : extension OPTIONNELLE, additive — écrit aussi les
 * lignes `economic_entitlements` (docs/ECONOMIC_MODEL.md §3) correspondant
 * au droit économique déjà calculé, dans la MÊME transaction/insert que
 * `reservation_financials` ci-dessus. `recordReservationFinancials()` reste
 * l'unique écrivain des droits (invariant §3.2.4). Portée STRICTEMENT
 * bornée au GO reçu : seul le module Network (`lib/network/
 * product-booking-actions.ts`) fournit `economicEntitlements` pour
 * l'instant — les 8 autres modules restent sans ce paramètre (ECON-WIRING-01,
 * chantier séparé, pas encore GO'd) et ne changent donc pas de comportement.
 * Statut initial toujours `earned` (aucune transition
 * earned → settleable/settled implémentée ici, cf. décision de scope).
 */

import type { DrizzleTransaction } from "@/lib/db/client"
import { economicEntitlements, reservationFinancials } from "@/lib/db/schema"

/** Une ligne de droit économique (`economic_entitlements`) — §3.1 du modèle. */
export interface EconomicEntitlementLineInput {
  partyType: string
  /** `agencies.id` / `supplier_nodes.id` — null pour easy2book/fournisseur externe non modélisé. */
  partyId: string | null
  role: "seller" | "product_owner" | "supplier" | "partner" | "easy2book" | "tax_authority" | "discount"
  qualification:
    | "supplier_cost"
    | "seller_margin"
    | "owner_share"
    | "commission"
    | "platform_fee"
    | "distribution_fee"
    | "revenue_share"
    | "service_fee"
    | "tax"
    | "discount"
  amount: number
  currency?: string
  /** Description libre de la base de calcul, ex. "net × 5%". */
  basis: string
  /** Placeholder AGREEMENT-01 — pointe vers `margin_rules.id` tant que
   * `commercial_agreements` n'existe pas. */
  agreementId?: string | null
  ruleId?: string | null
  cancellationTreatment?: "full_reversal" | "pro_rata_fee" | "non_refundable" | null
}

export interface RecordReservationFinancialsInput {
  tx: DrizzleTransaction
  reservationId: string
  /** Coût net fournisseur (HT), déjà confirmé par le fournisseur — jamais une estimation. */
  supplierPriceTnd: number
  /** Prix agence après marge (HT) — sortie de `applyMargin()`, jamais recalculé ici. */
  salePriceTnd: number
  /**
   * Taux de commission Easy2Book à prélever sur la marge nette
   * (de `MarginRule.commissionPercent`). Absent ou 0 = pas de commission.
   * Enregistré tel quel pour permettre le settlement ultérieur (Chantier 37B/C).
   */
  commissionPercent?: number
  /** ID de la règle `margin_rules` (System B) appliquée — `MarginRule.ruleId`. */
  marginRuleId?: string
  /**
   * ECON-BREAKDOWN-01 — lignes `economic_entitlements` à écrire dans la même
   * transaction. Optionnel : absent = comportement strictement inchangé
   * (aucune écriture sur `economic_entitlements`). Fourni aujourd'hui
   * uniquement par le module Network. La somme des `amount` DOIT être égale
   * à `salePriceTnd` (invariant §3.2.1) — non vérifié ici (responsabilité de
   * l'appelant + tests), pour ne pas faire échouer une écriture financière
   * réelle sur une assertion de développement.
   */
  economicEntitlements?: EconomicEntitlementLineInput[]
}

export async function recordReservationFinancials(
  input: RecordReservationFinancialsInput,
): Promise<{ commissionAmount: number }> {
  const { tx, reservationId, supplierPriceTnd, salePriceTnd } = input
  const marginAmount = salePriceTnd - supplierPriceTnd
  const marginPercent = supplierPriceTnd > 0 ? (marginAmount / supplierPriceTnd) * 100 : 0

  const commissionRate = input.commissionPercent ?? 0
  const commissionAmount = Math.round(marginAmount * (commissionRate / 100) * 100) / 100

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
    commissionAmount: commissionAmount.toFixed(2),
    commissionPercent: commissionRate.toFixed(2),
    ...(input.marginRuleId ? { marginRuleId: input.marginRuleId } : {}),
  })

  if (input.economicEntitlements && input.economicEntitlements.length > 0) {
    const now = new Date()
    await tx.insert(economicEntitlements).values(
      input.economicEntitlements.map((line) => ({
        reservationId,
        partyType: line.partyType,
        partyId: line.partyId,
        role: line.role,
        qualification: line.qualification,
        amount: line.amount.toFixed(2),
        currency: line.currency ?? "TND",
        basis: line.basis,
        agreementId: line.agreementId ?? null,
        ruleId: line.ruleId ?? null,
        status: "earned" as const,
        effectiveAt: now,
        cancellationTreatment: line.cancellationTreatment ?? null,
      })),
    )
  }

  return { commissionAmount }
}
