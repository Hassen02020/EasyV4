/**
 * Cœur DB du CRUD Policy Engine (Omra/Package/Activity) — DÉLIBÉRÉMENT PAS
 * un fichier `"use server"`.
 *
 * PHASE 38A (hardening) — gap confirmé : ces fonctions vivaient auparavant
 * dans `cancellation-policy-actions.ts` (`"use server"`), prenant
 * `agencyId`/`userId` en paramètres directs plutôt que de les résoudre
 * depuis une session Supabase (pour rester testables sans session live,
 * voir les tests DB de `lib/booking/__tests__/`). Or TOUT export d'un
 * fichier `"use server"` devient un Server Action Next.js potentiellement
 * invocable indépendamment via son ID d'action — vérifié dans le build réel
 * (`.next/server/server-reference-manifest.json`) : `publishCancellationPolicyForAgency`,
 * `listCancellationPoliciesForAgency` et `deactivateCancellationPolicyForAgency`
 * y étaient bien enregistrées avec un ID propre, alors qu'aucune d'elles
 * n'effectue sa propre vérification d'autorisation (`assertProductManager()`
 * n'était appelé QUE par les wrappers publics) — un appel direct à leur ID
 * d'action aurait donc pu écrire/lire des politiques pour N'IMPORTE QUELLE
 * agence, sans authentification.
 *
 * Ce fichier n'a PAS `"use server"` : ses exports ne peuvent jamais devenir
 * des Server Actions, quel que soit ce qui les importe à l'avenir — même
 * pattern déjà utilisé par lib/booking/customer-identity.ts. Les DEUX seuls
 * points d'entrée protégés par `assertProductManager()` restent
 * `lib/admin/cancellation-policy-actions.ts` (`"use server"`, wrappers fins).
 */

import { eq, and, isNull, desc } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { cancellationPolicies, auditEvents } from "@/lib/db/schema"
import type { PolicyProductType, ResolvedPolicy } from "@/lib/booking/policy-engine"

export interface CancellationPolicyRow extends ResolvedPolicy {
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface PublishCancellationPolicyInput {
  productType: PolicyProductType
  /** `null`/omis = politique par défaut pour tout ce productType chez l'agence. */
  productId?: string | null
  cancellable: boolean
  modifiable: boolean
  deadlineHours?: number | null
  cancellationFeePercent?: number | null
  refundAllowed: boolean
  creditAllowed: boolean
  nonRefundable?: boolean
  requiresValidatedDocument?: boolean
  postDeadlineDescription?: string | null
}

/**
 * Liste TOUT l'historique (toutes versions, actives et désactivées) pour
 * l'agence donnée — trié par type/produit puis version décroissante, pour
 * que l'UI puisse afficher "version courante" + historique sous chaque
 * groupe sans requête supplémentaire.
 */
export async function listCancellationPoliciesForAgency(
  agencyId: string,
): Promise<CancellationPolicyRow[]> {
  const rows = await withTenantContext(
    { agencyId, userId: "", isSuperAdmin: false },
    (tx) =>
      tx
        .select()
        .from(cancellationPolicies)
        .where(eq(cancellationPolicies.agencyId, agencyId))
        .orderBy(
          cancellationPolicies.productType,
          cancellationPolicies.productId,
          desc(cancellationPolicies.version),
        ),
  )
  return rows.map((row) => ({
    id: row.id,
    agencyId: row.agencyId,
    productType: row.productType as PolicyProductType,
    productId: row.productId,
    version: row.version,
    cancellable: row.cancellable,
    modifiable: row.modifiable,
    deadlineHours: row.deadlineHours,
    cancellationFeePercent:
      row.cancellationFeePercent == null ? null : parseFloat(row.cancellationFeePercent),
    refundAllowed: row.refundAllowed,
    creditAllowed: row.creditAllowed,
    nonRefundable: row.nonRefundable,
    requiresValidatedDocument: row.requiresValidatedDocument,
    postDeadlineDescription: row.postDeadlineDescription,
    effectiveFrom: row.effectiveFrom.toISOString(),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

/**
 * Publie une nouvelle version — désactive l'ancienne ligne active (même
 * agence + productType + productId), en insère une nouvelle avec
 * `version = ancienne + 1` (ou 1 si aucune n'existait encore). Les DEUX
 * écritures se font dans LA MÊME transaction : jamais un état intermédiaire
 * avec deux politiques actives, ni aucune active.
 */
export async function publishCancellationPolicyForAgency(
  agencyId: string,
  userId: string,
  input: PublishCancellationPolicyInput,
): Promise<{ id: string; version: number }> {
  const productId = input.productId ?? null

  // Phase 38A — gap confirmé : sans cette borne, un pourcentage négatif
  // (bonus involontaire) fait dépasser `creditableTnd` au montant réellement
  // capturé, et `applyReservationRefund` échoue avec AMOUNT_EXCEEDS_CAPTURED
  // à l'annulation (transaction annulée en entier, jamais de crédit). Un
  // pourcentage > 100 est déjà neutralisé par `Math.max(0, ...)` dans
  // `evaluateCancellation`, mais autant refuser la saisie à la source plutôt
  // que compter sur ce filet côté calcul. Doublé d'un CHECK en base
  // (0038_cancellation_policies_hardening.sql) pour toute écriture qui ne
  // passerait pas par cette fonction.
  if (
    input.cancellationFeePercent != null &&
    (input.cancellationFeePercent < 0 || input.cancellationFeePercent > 100)
  ) {
    throw new Error("Le pourcentage de frais d'annulation doit être compris entre 0 et 100.")
  }

  return withTenantContext({ agencyId, userId, isSuperAdmin: false }, async (tx) => {
    const existingMatch = productId
      ? eq(cancellationPolicies.productId, productId)
      : isNull(cancellationPolicies.productId)

    const [previous] = await tx
      .select({ id: cancellationPolicies.id, version: cancellationPolicies.version })
      .from(cancellationPolicies)
      .where(
        and(
          eq(cancellationPolicies.agencyId, agencyId),
          eq(cancellationPolicies.productType, input.productType),
          existingMatch,
          eq(cancellationPolicies.isActive, true),
        ),
      )
      .limit(1)

    if (previous) {
      await tx
        .update(cancellationPolicies)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(cancellationPolicies.id, previous.id))
    }

    const [inserted] = await tx
      .insert(cancellationPolicies)
      .values({
        agencyId,
        productType: input.productType,
        productId,
        version: (previous?.version ?? 0) + 1,
        isActive: true,
        cancellable: input.cancellable,
        modifiable: input.modifiable,
        deadlineHours: input.deadlineHours ?? null,
        cancellationFeePercent:
          input.cancellationFeePercent == null ? null : String(input.cancellationFeePercent),
        refundAllowed: input.refundAllowed,
        creditAllowed: input.creditAllowed,
        nonRefundable: input.nonRefundable ?? false,
        requiresValidatedDocument: input.requiresValidatedDocument ?? false,
        postDeadlineDescription: input.postDeadlineDescription ?? null,
        createdByUserId: userId,
      })
      .returning({ id: cancellationPolicies.id, version: cancellationPolicies.version })

    await tx.insert(auditEvents).values({
      agencyId,
      actorUserId: userId,
      entityType: "cancellation_policy",
      entityId: inserted!.id,
      action: "cancellation_policy.published",
      diff: {
        productType: input.productType,
        productId,
        version: inserted!.version,
        previousVersionId: previous?.id ?? null,
      },
    })

    return inserted!
  })
}

/**
 * Désactive une politique SANS publier de remplaçante — le produit retombe
 * sur la politique par défaut de l'agence (ou `null`/"non définie" s'il n'y
 * en a pas). Ne supprime jamais la ligne (historique conservé).
 */
export async function deactivateCancellationPolicyForAgency(
  agencyId: string,
  userId: string,
  policyId: string,
): Promise<void> {
  await withTenantContext({ agencyId, userId, isSuperAdmin: false }, async (tx) => {
    await tx
      .update(cancellationPolicies)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(cancellationPolicies.id, policyId))
    await tx.insert(auditEvents).values({
      agencyId,
      actorUserId: userId,
      entityType: "cancellation_policy",
      entityId: policyId,
      action: "cancellation_policy.deactivated",
      diff: {},
    })
  })
}
