/**
 * PHASE "POLICY ENGINE OMRA/PACKAGE/ACTIVITY" — moteur central de
 * politiques d'annulation/modification.
 *
 * Portée stricte : Omra / Package / Activity UNIQUEMENT. L'hôtel garde
 * `cancellationPolicies` fournisseur myGo (normalisées par le Universal
 * Hub) comme SEULE autorité — voir lib/booking/cancel-actions.ts et
 * lib/booking/customer-cancel-actions.ts, jamais touchés par ce module.
 *
 * Résolution (`resolveCancellationPolicy`) : produit/offre spécifique
 * (`productId` non nul, une ligne `cancellation_policies` active ciblant
 * CE produit précis) > politique par défaut de l'agence pour ce
 * `productType` (`productId` nul) > `null` — AUCUNE politique n'est jamais
 * inventée par défaut ; `null` doit se traduire côté UI par "Politique non
 * définie", jamais par un calcul de pénalité fabriqué.
 *
 * Versionnement : une politique n'est JAMAIS écrasée (voir
 * lib/admin/cancellation-policy-actions.ts::publishCancellationPolicy) —
 * "modifier" crée une nouvelle ligne `version = ancienne + 1`, désactive
 * l'ancienne. L'historique complet reste en base.
 *
 * Snapshot (`buildPolicySnapshot`) : au moment de la réservation, la
 * politique RÉSOLUE (ou son absence) est figée dans
 * `reservations.providerPayload.policySnapshot` (voir chaque
 * `guest-booking-actions.ts` par module) — un changement de version
 * ultérieur ne modifie JAMAIS rétroactivement ce qu'un client a déjà vu et
 * accepté. L'annulation (lib/booking/policy-cancel-actions.ts) lit
 * TOUJOURS ce snapshot, jamais une résolution live.
 */

import { eq, and, isNull } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { cancellationPolicies } from "@/lib/db/schema"

export type PolicyProductType = "omra" | "package" | "activity"

export interface ResolvedPolicy {
  id: string
  agencyId: string
  productType: PolicyProductType
  /** `null` = politique par défaut de l'agence pour ce type de produit (pas ciblée à une offre précise). */
  productId: string | null
  version: number
  cancellable: boolean
  modifiable: boolean
  /** Heures avant le début du service au-delà desquelles la politique ne s'applique plus telle quelle. `null` = aucune échéance configurée par l'Admin. */
  deadlineHours: number | null
  /** 0–100. `null` = aucun frais configuré (distinct de 0 explicite). */
  cancellationFeePercent: number | null
  refundAllowed: boolean
  creditAllowed: boolean
  nonRefundable: boolean
  requiresValidatedDocument: boolean
  postDeadlineDescription: string | null
  effectiveFrom: string
}

/**
 * Résout la politique applicable à un produit précis chez une agence —
 * `null` si aucune politique (spécifique OU par défaut) n'a été publiée
 * par le Master Admin. Jamais de valeur inventée en repli.
 */
export async function resolveCancellationPolicy(
  tx: DrizzleTransaction,
  params: { agencyId: string; productType: PolicyProductType; productId: string | null },
): Promise<ResolvedPolicy | null> {
  const { agencyId, productType, productId } = params

  if (productId) {
    const [specific] = await tx
      .select()
      .from(cancellationPolicies)
      .where(
        and(
          eq(cancellationPolicies.agencyId, agencyId),
          eq(cancellationPolicies.productType, productType),
          eq(cancellationPolicies.productId, productId),
          eq(cancellationPolicies.isActive, true),
        ),
      )
      .limit(1)
    if (specific) return mapRow(specific)
  }

  const [byDefault] = await tx
    .select()
    .from(cancellationPolicies)
    .where(
      and(
        eq(cancellationPolicies.agencyId, agencyId),
        eq(cancellationPolicies.productType, productType),
        isNull(cancellationPolicies.productId),
        eq(cancellationPolicies.isActive, true),
      ),
    )
    .limit(1)
  if (byDefault) return mapRow(byDefault)

  return null
}

function mapRow(row: typeof cancellationPolicies.$inferSelect): ResolvedPolicy {
  return {
    id: row.id,
    agencyId: row.agencyId,
    productType: row.productType as PolicyProductType,
    productId: row.productId,
    version: row.version,
    cancellable: row.cancellable,
    modifiable: row.modifiable,
    deadlineHours: row.deadlineHours,
    cancellationFeePercent: row.cancellationFeePercent == null ? null : parseFloat(row.cancellationFeePercent),
    refundAllowed: row.refundAllowed,
    creditAllowed: row.creditAllowed,
    nonRefundable: row.nonRefundable,
    requiresValidatedDocument: row.requiresValidatedDocument,
    postDeadlineDescription: row.postDeadlineDescription,
    effectiveFrom: row.effectiveFrom.toISOString(),
  }
}

export interface PolicySnapshot {
  /** Horodatage de la résolution — au moment de la réservation, jamais recalculé après coup. */
  resolvedAt: string
  /** `null` = "Politique non définie" au moment de cette réservation précise. */
  policy: ResolvedPolicy | null
  /** Coché par le client avant validation — n'a de sens que si `policy !== null` (rien à accepter sinon). */
  acceptedByCustomer: boolean
}

export function buildPolicySnapshot(
  policy: ResolvedPolicy | null,
  acceptedByCustomer: boolean,
): PolicySnapshot {
  return { resolvedAt: new Date().toISOString(), policy, acceptedByCustomer }
}

/**
 * Calcul du remboursement/crédit à partir du SNAPSHOT figé à la
 * réservation — jamais une résolution live (voir doc de tête). Pure,
 * aucune donnée inventée : `feePercent`/`refundAllowed`/`creditAllowed`
 * viennent exclusivement du snapshot ; l'absence de politique ou de frais
 * configuré se traduit par des valeurs `null`/`false` honnêtes, jamais un
 * pourcentage par défaut.
 */
export interface CancellationOutcome {
  allowed: boolean
  /** Raison lisible si `allowed === false`. */
  reason?: string
  /** Montant total payé de la réservation, moins les frais éventuels. `null` si aucun frais/remboursement n'est calculable (aucune politique). */
  creditableTnd: number | null
  feePercent: number | null
}

export function evaluateCancellation(
  snapshot: PolicySnapshot | null,
  reservationTndAmount: number,
): CancellationOutcome {
  if (!snapshot || !snapshot.policy) {
    return {
      allowed: false,
      reason:
        "Aucune politique d'annulation n'était définie au moment de cette réservation — contactez le support pour un traitement manuel.",
      creditableTnd: null,
      feePercent: null,
    }
  }
  const { policy } = snapshot
  if (!policy.cancellable || policy.nonRefundable) {
    return {
      allowed: false,
      reason: policy.nonRefundable
        ? "Cette réservation est non remboursable selon la politique acceptée."
        : "Cette réservation n'est pas annulable selon la politique acceptée.",
      creditableTnd: null,
      feePercent: null,
    }
  }
  if (!policy.refundAllowed && !policy.creditAllowed) {
    return {
      allowed: true,
      creditableTnd: 0,
      feePercent: policy.cancellationFeePercent,
    }
  }
  const feePercent = policy.cancellationFeePercent ?? 0
  const creditableTnd = Math.max(0, reservationTndAmount * (1 - feePercent / 100))
  return { allowed: true, creditableTnd, feePercent: policy.cancellationFeePercent }
}
