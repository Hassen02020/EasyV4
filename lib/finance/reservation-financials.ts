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
 *
 * CURRENCY-DIM-01 (plomberie uniquement, 2026-10) : `reservation_financials`
 * a toujours eu les colonnes `supplier_currency`/`sale_currency`/
 * `exchange_rate`/`exchange_rate_at` — jamais renseignées avec de vraies
 * valeurs (toujours `"TND"`/`1`/`null`). Ajout OPTIONNEL et additif de
 * `supplierOriginal`/`saleOriginal`/`exchangeRate` ci-dessous : absents =
 * comportement STRICTEMENT inchangé (les 13 call sites actuels ne les
 * passent pas). Cette fonction ne calcule ni n'invente AUCUN taux — elle se
 * contente de persister ce que l'appelant fournit déjà (même discipline que
 * `supplierPriceTnd`/`salePriceTnd` ci-dessus). Aucun appelant réel
 * n'existe encore : ni Vols ni Hotels-Monde ne sont câblés dessus — aucun
 * fournisseur réel n'est aujourd'hui connecté pour l'un ou l'autre (seuls
 * des adaptateurs de démo/virtuels), donc aucun vrai taux fournisseur n'est
 * disponible à câbler sans l'inventer (voir la règle permanente "Taux de
 * change" dans CLAUDE.md § RÈGLE FINANCIÈRE, et les correctifs CURRENCY-
 * DIM-01a/01b qui ont fermé les deux trous trouvés entre-temps). Le
 * câblage réel (Vols/Hotels-Monde) reste un chantier séparé, à reprendre
 * une fois un vrai fournisseur connecté, pas avant.
 */

import type { DrizzleTransaction } from "@/lib/db/client"
import { economicEntitlements, reservationFinancials } from "@/lib/db/schema"
import type { AppliedRate } from "./fx-policy"

/** Une ligne de droit économique (`economic_entitlements`) — §3.1 du modèle. */
export interface EconomicEntitlementLineInput {
  partyType: string
  /** `agencies.id` / `supplier_nodes.id` — null pour easy2book/fournisseur externe non modélisé. */
  partyId: string | null
  role:
    | "seller"
    | "product_owner"
    | "supplier"
    | "partner"
    | "easy2book"
    | "tax_authority"
    | "discount"
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
  cancellationTreatment?:
    | "full_reversal"
    | "pro_rata_fee"
    | "non_refundable"
    | null
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
  /**
   * CURRENCY-DIM-01 (plomberie) — montant + devise d'origine RÉELS côté
   * fournisseur, quand connus et différents de TND. Optionnel : absent =
   * `supplierCurrency = "TND"`, `supplierPrice = supplierPriceTnd`
   * (comportement actuel, strictement inchangé). Ne JAMAIS déduire/inventer
   * cette valeur — seulement la transmettre telle que fournie par le
   * fournisseur réel.
   */
  supplierOriginal?: { amount: number; currency: string }
  /**
   * CURRENCY-DIM-01 (plomberie) — montant + devise d'origine RÉELS côté
   * vente, quand connus et différents de TND. Optionnel, même règle que
   * `supplierOriginal` ci-dessus.
   */
  saleOriginal?: { amount: number; currency: string }
  /**
   * CURRENCY-DIM-01 (plomberie) — taux de change RÉEL appliqué pour la
   * conversion ci-dessus, avec son horodatage de capture. Optionnel : absent
   * = `exchange_rate`/`exchange_rate_at` gardent leurs valeurs par défaut
   * (`1`/`null`), comportement actuel inchangé. Jamais calculé ni inventé
   * ici (voir règle permanente "Taux de change", CLAUDE.md § RÈGLE
   * FINANCIÈRE) — uniquement un taux réel déjà obtenu par l'appelant
   * (source fournisseur/PSP au moment de la transaction, par décision
   * Direction 2026-10-01), à 4 décimales.
   */
  exchangeRate?: { rate: number; at: Date }
  /**
   * CURRENCY-DIM-02 — taux appliqué (taux référence + correction banque)
   * et `policyId` (FK immuable vers la version de politique utilisée).
   * Optionnel : absent = `applied_exchange_rate`/`applied_exchange_rate_at`/
   * `fx_policy_id` restent NULL — comportement inchangé pour les 13 call
   * sites qui ne passent pas de politique FX (modules TND natifs).
   */
  appliedRate?: AppliedRate
}

export async function recordReservationFinancials(
  input: RecordReservationFinancialsInput,
): Promise<{ commissionAmount: number }> {
  const { tx, reservationId, supplierPriceTnd, salePriceTnd } = input
  const marginAmount = salePriceTnd - supplierPriceTnd
  const marginPercent =
    supplierPriceTnd > 0 ? (marginAmount / supplierPriceTnd) * 100 : 0

  const commissionRate = input.commissionPercent ?? 0
  const commissionAmount =
    Math.round(marginAmount * (commissionRate / 100) * 100) / 100

  await tx.insert(reservationFinancials).values({
    reservationId,
    supplierPrice: (input.supplierOriginal?.amount ?? supplierPriceTnd).toFixed(
      2,
    ),
    supplierCurrency: input.supplierOriginal?.currency ?? "TND",
    supplierPriceTnd: supplierPriceTnd.toFixed(2),
    salePrice: (input.saleOriginal?.amount ?? salePriceTnd).toFixed(2),
    saleCurrency: input.saleOriginal?.currency ?? "TND",
    salePriceTnd: salePriceTnd.toFixed(2),
    marginAmount: marginAmount.toFixed(2),
    marginPercent: marginPercent.toFixed(2),
    commissionAmount: commissionAmount.toFixed(2),
    commissionPercent: commissionRate.toFixed(2),
    ...(input.marginRuleId ? { marginRuleId: input.marginRuleId } : {}),
    ...(input.exchangeRate
      ? {
          exchangeRate: input.exchangeRate.rate.toFixed(4),
          exchangeRateAt: input.exchangeRate.at,
        }
      : {}),
    ...(input.appliedRate
      ? {
          appliedExchangeRate: input.appliedRate.appliedRate.toFixed(6),
          appliedExchangeRateAt: input.appliedRate.capturedAt,
          fxPolicyId: input.appliedRate.policyId,
        }
      : {}),
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
