"use server"

/**
 * Avis clients — modération staff (`/admin/reviews`). Même garde que le
 * catalogue produit (`assertProductManager`) : approuver/rejeter un avis
 * engage la réputation publique de la plateforme, pas une tâche de
 * support courante — réservé à super_admin/manager, pas aux 3 rôles
 * "support" (voir lib/admin/leads-actions.ts pour ce jeu de rôles plus
 * large, différent, volontairement).
 */

import { revalidatePath } from "next/cache"
import { withTenantContext } from "@/lib/db/tenant-context"
import { assertProductManager } from "@/lib/admin/product-guard"
import {
  listReviewsForModerationCore,
  moderateReviewCore,
  REVIEW_STATUSES,
  type ReviewRow,
  type ReviewStatus,
} from "@/lib/reviews/reviews-core"

export type ListReviewsForModerationResult = { ok: true; reviews: ReviewRow[] } | { ok: false; error: string }

export async function listReviewsForModeration(status?: ReviewStatus): Promise<ListReviewsForModerationResult> {
  let ctx: { userId: string; agencyId: string }
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    const rows = await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      listReviewsForModerationCore(tx, { agencyId: ctx.agencyId, status }),
    )
    return { ok: true, reviews: rows }
  } catch (err) {
    console.error("[listReviewsForModeration]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type ModerateReviewResult = { ok: true } | { ok: false; error: string }

export async function moderateReview(input: {
  id: string
  status: ReviewStatus
}): Promise<ModerateReviewResult> {
  let ctx: { userId: string; agencyId: string }
  try {
    ctx = await assertProductManager()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }
  if (!(REVIEW_STATUSES as readonly string[]).includes(input.status) || input.status === "pending") {
    return { ok: false, error: "Statut invalide." }
  }
  const status = input.status

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) =>
        moderateReviewCore(tx, {
          agencyId: ctx.agencyId,
          id: input.id,
          status,
          moderatedByUserId: ctx.userId,
        }),
    )
    if (!result.updated) return { ok: false, error: "Avis introuvable." }
    revalidatePath("/admin/reviews")
    return { ok: true }
  } catch (err) {
    console.error("[moderateReview]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
