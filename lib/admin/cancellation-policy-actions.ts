"use server"

/**
 * Master Admin — CRUD Policy Engine (Omra/Package/Activity uniquement).
 *
 * Même garde que le reste du Master Admin Product Builder
 * (`assertProductManager()` — role manager/super_admin, agence OTA, voir
 * lib/admin/product-guard.ts) et même modèle d'écriture tenant
 * (`withTenantContext({agencyId: ctx.agencyId, ...})` — un Master Admin ne
 * publie jamais de politique pour une autre agence que la sienne).
 *
 * Versionnement : `publishCancellationPolicy` ne fait JAMAIS un UPDATE sur
 * le contenu d'une politique existante — "modifier" désactive l'ancienne
 * ligne active (même cible produit/type) et INSERT une nouvelle ligne
 * `version = ancienne + 1`. L'historique complet reste interrogeable.
 */

import { revalidatePath } from "next/cache"
import { eq, and, isNull, desc } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { cancellationPolicies, auditEvents } from "@/lib/db/schema"
import { assertProductManager } from "./product-guard"
import type { ProductActionResult } from "./packages-actions"
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
 * l'agence courante — trié par type/produit puis version décroissante, pour
 * que l'UI puisse afficher "version courante" + historique sous chaque
 * groupe sans requête supplémentaire.
 */
export async function listCancellationPolicies(): Promise<
  ProductActionResult<CancellationPolicyRow[]>
> {
  try {
    const ctx = await assertProductManager()
    const data = await listCancellationPoliciesForAgency(ctx.agencyId)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur interne" }
  }
}

/**
 * Cœur testable, isolé de `assertProductManager()` (session Master Admin
 * live) — même pattern que `cancelPolicyReservationCore`
 * (lib/booking/policy-cancel-actions.ts) : l'agence est passée directement,
 * testable contre une vraie transaction DB sans session Supabase.
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
export async function publishCancellationPolicy(
  input: PublishCancellationPolicyInput,
): Promise<ProductActionResult<{ id: string; version: number }>> {
  try {
    const ctx = await assertProductManager()
    const result = await publishCancellationPolicyForAgency(ctx.agencyId, ctx.userId, input)
    revalidatePath("/admin/policies")
    return { ok: true, data: result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur interne" }
  }
}

/** Cœur testable, isolé de `assertProductManager()` — voir doc de `listCancellationPoliciesForAgency`. */
export async function publishCancellationPolicyForAgency(
  agencyId: string,
  userId: string,
  input: PublishCancellationPolicyInput,
): Promise<{ id: string; version: number }> {
  const productId = input.productId ?? null

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
export async function deactivateCancellationPolicy(
  policyId: string,
): Promise<ProductActionResult<null>> {
  try {
    const ctx = await assertProductManager()
    await deactivateCancellationPolicyForAgency(ctx.agencyId, ctx.userId, policyId)
    revalidatePath("/admin/policies")
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur interne" }
  }
}

/** Cœur testable, isolé de `assertProductManager()` — voir doc de `listCancellationPoliciesForAgency`. */
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
