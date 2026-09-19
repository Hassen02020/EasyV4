"use server"

/**
 * Chantier "Mutuelle" — fondation du cycle demande→validation (voir
 * drizzle/manual/0062_mutuelle_requests.sql). Portée volontairement
 * minimale, conforme à l'analyse validée avant implémentation :
 *   - un membre soumet une demande LIBRE (aucun catalogue restreint
 *     n'existe encore — `description` texte, `module` = indication, pas un
 *     lien vers un vrai produit) ;
 *   - un directeur du MÊME groupe valide/refuse ;
 *   - AUCUNE application de `mutuelleGroups.markupPercent` au prix, AUCUNE
 *     transmission automatique vers une réservation réelle chez l'agence
 *     d'exécution, AUCUNE facturation — chantiers suivants explicites.
 *
 * Autorisation réelle : comme documenté dans
 * drizzle/manual/0061_app_runtime_role_and_rls_gaps.sql, la connexion
 * applicative réelle (rôle `postgres`, BYPASSRLS) rend RLS actuellement
 * inerte en production — la distinction membre/directeur DOIT donc être
 * vérifiée ici, jamais uniquement par les policies RLS (posées par
 * cohérence, voir la migration).
 */

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { mutuelleRequests, mutuelleGroups, auditEvents, reservationModule, users } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile, type AdminProfile } from "@/lib/auth/profile"
import { logger } from "@/lib/logger"

async function requireMutuelleProfile(
  expectedRole: "mutuelle_member" | "mutuelle_director",
): Promise<{ ok: true; userId: string; profile: AdminProfile } | { ok: false; error: string }> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !profile.mutuelleGroupId) {
    return { ok: false, error: "Profil Mutuelle introuvable" }
  }
  if (profile.role !== expectedRole) {
    return {
      ok: false,
      error:
        expectedRole === "mutuelle_member"
          ? "Seul un membre peut soumettre une demande."
          : "Seul le directeur du groupe peut valider une demande.",
    }
  }
  return { ok: true, userId: user.id, profile }
}

/* -------------------------------------------------------------------------- */
/* 1. Membre — Soumettre une demande                                          */
/* -------------------------------------------------------------------------- */

const MODULE_VALUES = reservationModule.enumValues

const submitInputSchema = z.object({
  module: z.enum(MODULE_VALUES as [string, ...string[]]),
  description: z.string().trim().min(1).max(2000),
  travelStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  travelEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paxCount: z.coerce.number().int().min(1).max(50),
})

export type SubmitMutuelleRequestInput = z.infer<typeof submitInputSchema>
export type SubmitMutuelleRequestResult = { ok: true; id: string } | { ok: false; error: string }

export async function submitMutuelleRequest(
  raw: SubmitMutuelleRequestInput,
): Promise<SubmitMutuelleRequestResult> {
  const parsed = submitInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  if (input.travelEndDate < input.travelStartDate) {
    return { ok: false, error: "La date de retour doit être après la date de départ." }
  }

  const auth = await requireMutuelleProfile("mutuelle_member")
  if (!auth.ok) return { ok: false, error: auth.error }
  const { userId, profile } = auth
  const groupId = profile.mutuelleGroupId!

  try {
    const requestId = await withTenantContext(
      { agencyId: null, userId, isSuperAdmin: false, mutuelleGroupId: groupId },
      async (tx) => {
        const [group] = await tx
          .select({ executionAgencyId: mutuelleGroups.executionAgencyId })
          .from(mutuelleGroups)
          .where(eq(mutuelleGroups.id, groupId))
          .limit(1)
        if (!group) throw new Error("Groupe Mutuelle introuvable")

        const [created] = await tx
          .insert(mutuelleRequests)
          .values({
            groupId,
            memberUserId: userId,
            module: input.module as (typeof MODULE_VALUES)[number],
            description: input.description,
            travelStartDate: input.travelStartDate,
            travelEndDate: input.travelEndDate,
            paxCount: input.paxCount,
          })
          .returning({ id: mutuelleRequests.id })

        await tx.insert(auditEvents).values({
          agencyId: group.executionAgencyId,
          actorUserId: userId,
          entityType: "mutuelle_request",
          entityId: created.id,
          action: "mutuelle_request.submitted",
          diff: { module: input.module, travelStartDate: input.travelStartDate, travelEndDate: input.travelEndDate },
        })

        return created.id
      },
    )

    revalidatePath("/mutuelle/dossiers")
    return { ok: true, id: requestId }
  } catch (err) {
    logger.error("[mutuelle-requests-actions] submitMutuelleRequest failed", {
      err: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Lecture                                                                  */
/* -------------------------------------------------------------------------- */

export interface MutuelleRequestRow {
  id: string
  module: string
  description: string
  travelStartDate: string
  travelEndDate: string
  paxCount: number
  status: "pending" | "approved" | "rejected"
  directorNote: string | null
  memberUserId: string
  memberName: string | null
  memberEmail: string
  reviewedAt: Date | null
  createdAt: Date
}

/** Mes propres demandes (vue membre). */
export async function listMyMutuelleRequests(): Promise<MutuelleRequestRow[]> {
  const auth = await requireMutuelleProfile("mutuelle_member")
  if (!auth.ok) return []
  const { userId, profile } = auth
  const groupId = profile.mutuelleGroupId!

  return withTenantContext(
    { agencyId: null, userId, isSuperAdmin: false, mutuelleGroupId: groupId },
    async (tx) => {
      const rows = await tx
        .select({
          id: mutuelleRequests.id,
          module: mutuelleRequests.module,
          description: mutuelleRequests.description,
          travelStartDate: mutuelleRequests.travelStartDate,
          travelEndDate: mutuelleRequests.travelEndDate,
          paxCount: mutuelleRequests.paxCount,
          status: mutuelleRequests.status,
          directorNote: mutuelleRequests.directorNote,
          memberUserId: mutuelleRequests.memberUserId,
          memberName: users.name,
          memberEmail: users.email,
          reviewedAt: mutuelleRequests.reviewedAt,
          createdAt: mutuelleRequests.createdAt,
        })
        .from(mutuelleRequests)
        .innerJoin(users, eq(users.id, mutuelleRequests.memberUserId))
        .where(and(eq(mutuelleRequests.groupId, groupId), eq(mutuelleRequests.memberUserId, userId)))
        .orderBy(desc(mutuelleRequests.createdAt))
      return rows
    },
  )
}

/** Toutes les demandes du groupe (vue directeur — file d'attente + historique). */
export async function listGroupMutuelleRequests(): Promise<MutuelleRequestRow[]> {
  const auth = await requireMutuelleProfile("mutuelle_director")
  if (!auth.ok) return []
  const { userId, profile } = auth
  const groupId = profile.mutuelleGroupId!

  return withTenantContext(
    { agencyId: null, userId, isSuperAdmin: false, mutuelleGroupId: groupId },
    async (tx) => {
      const rows = await tx
        .select({
          id: mutuelleRequests.id,
          module: mutuelleRequests.module,
          description: mutuelleRequests.description,
          travelStartDate: mutuelleRequests.travelStartDate,
          travelEndDate: mutuelleRequests.travelEndDate,
          paxCount: mutuelleRequests.paxCount,
          status: mutuelleRequests.status,
          directorNote: mutuelleRequests.directorNote,
          memberUserId: mutuelleRequests.memberUserId,
          memberName: users.name,
          memberEmail: users.email,
          reviewedAt: mutuelleRequests.reviewedAt,
          createdAt: mutuelleRequests.createdAt,
        })
        .from(mutuelleRequests)
        .innerJoin(users, eq(users.id, mutuelleRequests.memberUserId))
        .where(eq(mutuelleRequests.groupId, groupId))
        .orderBy(desc(mutuelleRequests.createdAt))
      return rows
    },
  )
}

/* -------------------------------------------------------------------------- */
/* 3. Directeur — Valider / refuser                                           */
/* -------------------------------------------------------------------------- */

const reviewInputSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  directorNote: z.string().trim().max(2000).optional(),
})

export type ReviewMutuelleRequestInput = z.infer<typeof reviewInputSchema>
export type ReviewMutuelleRequestResult = { ok: true } | { ok: false; error: string }

export async function reviewMutuelleRequest(
  raw: ReviewMutuelleRequestInput,
): Promise<ReviewMutuelleRequestResult> {
  const parsed = reviewInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  const auth = await requireMutuelleProfile("mutuelle_director")
  if (!auth.ok) return { ok: false, error: auth.error }
  const { userId, profile } = auth
  const groupId = profile.mutuelleGroupId!

  try {
    return await withTenantContext(
      { agencyId: null, userId, isSuperAdmin: false, mutuelleGroupId: groupId },
      async (tx) => {
        const [group] = await tx
          .select({ executionAgencyId: mutuelleGroups.executionAgencyId })
          .from(mutuelleGroups)
          .where(eq(mutuelleGroups.id, groupId))
          .limit(1)
        if (!group) throw new Error("Groupe Mutuelle introuvable")

        // Verrou + re-vérification du statut DANS la transaction — anti
        // double-validation concurrente (même garde que
        // validateRechargeRequest/refundReservation ailleurs dans ce projet).
        const [locked] = await tx
          .select({ id: mutuelleRequests.id, groupId: mutuelleRequests.groupId, status: mutuelleRequests.status })
          .from(mutuelleRequests)
          .where(eq(mutuelleRequests.id, input.requestId))
          .for("update")

        if (!locked || locked.groupId !== groupId) {
          return { ok: false as const, error: "Demande introuvable dans votre groupe." }
        }
        if (locked.status !== "pending") {
          return { ok: false as const, error: `Cette demande est déjà "${locked.status}".` }
        }

        await tx
          .update(mutuelleRequests)
          .set({
            status: input.decision,
            directorNote: input.directorNote || null,
            reviewedByUserId: userId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(mutuelleRequests.id, input.requestId))

        await tx.insert(auditEvents).values({
          agencyId: group.executionAgencyId,
          actorUserId: userId,
          entityType: "mutuelle_request",
          entityId: input.requestId,
          action: input.decision === "approved" ? "mutuelle_request.approved" : "mutuelle_request.rejected",
          diff: { decision: input.decision, directorNote: input.directorNote ?? null },
        })

        return { ok: true as const }
      },
    ).then((result) => {
      if (result.ok) revalidatePath("/mutuelle/dossiers")
      return result
    })
  } catch (err) {
    logger.error("[mutuelle-requests-actions] reviewMutuelleRequest failed", {
      err: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}
