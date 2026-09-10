"use server"

/**
 * Master Admin — CRUD Policy Engine (Omra/Package/Activity uniquement).
 *
 * Wrappers FINS uniquement — chaque export ici est un Server Action
 * Next.js potentiellement invocable indépendamment (voir
 * lib/admin/cancellation-policy-core.ts, doc de tête, Phase 38A) : la
 * logique DB réelle vit dans `cancellation-policy-core.ts` (PAS
 * `"use server"`), ce fichier se contente de vérifier
 * `assertProductManager()` (role manager/super_admin, agence OTA) AVANT de
 * lui déléguer — un Master Admin ne publie jamais de politique pour une
 * autre agence que la sienne (agencyId vient TOUJOURS de la session
 * vérifiée, jamais d'un paramètre client).
 */

import { revalidatePath } from "next/cache"
import { assertProductManager } from "./product-guard"
import type { ProductActionResult } from "./packages-actions"
import {
  listCancellationPoliciesForAgency,
  publishCancellationPolicyForAgency,
  deactivateCancellationPolicyForAgency,
  type CancellationPolicyRow,
  type PublishCancellationPolicyInput,
} from "./cancellation-policy-core"

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
