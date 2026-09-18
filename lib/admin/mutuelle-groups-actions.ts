"use server"

/**
 * Gestion des groupes Mutuelle (distributeurs privés B2B2C) — chantier
 * "Mutuelle" fondation données, voir drizzle/manual/0058_mutuelle_groups.sql
 * et docs/audits/architecture-vision-audit.md.
 *
 * Réservé à super_admin — une Mutuelle est une relation commerciale
 * plateforme (convention Easy2Book), pas une ressource d'agence comme le
 * personnel géré par lib/admin/users-actions.ts.
 *
 * Création de directeur/membre : même pattern que
 * lib/admin/users-actions.ts::createStaffUser (invite Supabase Admin API +
 * insertion users, rollback du compte Auth si l'insertion échoue). Un
 * directeur/membre garde un `agencyId` réel (NOT NULL, contrainte existante
 * sur `users`) pointant vers l'OTA directe par défaut — jamais l'agence
 * d'exécution du groupe, pour ne pas lui accorder silencieusement les accès
 * RLS scopés à cette agence (réservations d'autres clients B2B, etc.). Son
 * scope réel est `mutuelleGroupId`, jamais `agencyId`.
 */

import { revalidatePath } from "next/cache"
import { and, eq, isNotNull, count } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { auditEvents, mutuelleGroups, users, agencies } from "@/lib/db/schema"
import { createServerSupabase, createServiceRoleSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"

async function requireSuperAdmin() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") {
    return { ok: false as const, error: "Seul un super_admin peut gérer les groupes Mutuelle." }
  }
  return { ok: true as const, user, profile }
}

/* -------------------------------------------------------------------------- */
/* Création d'un groupe                                                        */
/* -------------------------------------------------------------------------- */

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug : lettres minuscules, chiffres et tirets uniquement"),
  executionAgencyId: z.string().uuid(),
  markupPercent: z.coerce.number().min(0).max(100),
  conventionStartDate: z.string().optional().default(""),
  conventionEndDate: z.string().optional().default(""),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().max(32).optional().default(""),
})

export type CreateMutuelleGroupResult = { ok: true; groupId: string } | { ok: false; error: string }

export async function createMutuelleGroup(
  raw: z.infer<typeof createGroupSchema>,
): Promise<CreateMutuelleGroupResult> {
  const parsed = createGroupSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  try {
    const groupId = await withTenantContext(
      { agencyId: null, userId: user.id, isSuperAdmin: true },
      async (tx) => {
        const [agency] = await tx
          .select({ id: agencies.id })
          .from(agencies)
          .where(eq(agencies.id, input.executionAgencyId))
          .limit(1)
        if (!agency) throw new Error("Agence d'exécution introuvable")

        const [group] = await tx
          .insert(mutuelleGroups)
          .values({
            name: input.name,
            slug: input.slug,
            executionAgencyId: input.executionAgencyId,
            markupPercent: input.markupPercent.toFixed(2),
            conventionStartDate: input.conventionStartDate || null,
            conventionEndDate: input.conventionEndDate || null,
            contactEmail: input.contactEmail || null,
            contactPhone: input.contactPhone || null,
          })
          .returning({ id: mutuelleGroups.id })

        await tx.insert(auditEvents).values({
          agencyId: input.executionAgencyId,
          actorUserId: user.id,
          entityType: "mutuelle_group",
          entityId: group.id,
          action: "mutuelle_group.created",
          diff: { name: input.name, slug: input.slug, executionAgencyId: input.executionAgencyId },
        })

        return group.id
      },
    )

    revalidatePath("/admin/mutuelle")
    return { ok: true, groupId }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue"
    return { ok: false, error: message }
  }
}

/* -------------------------------------------------------------------------- */
/* Statut (activer / suspendre)                                                */
/* -------------------------------------------------------------------------- */

export type SetMutuelleGroupStatusResult = { ok: true } | { ok: false; error: string }

export async function setMutuelleGroupStatus(
  groupId: string,
  status: "active" | "suspended",
): Promise<SetMutuelleGroupStatusResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  try {
    await withTenantContext({ agencyId: null, userId: user.id, isSuperAdmin: true }, async (tx) => {
      const [updated] = await tx
        .update(mutuelleGroups)
        .set({ status, updatedAt: new Date() })
        .where(eq(mutuelleGroups.id, groupId))
        .returning({ id: mutuelleGroups.id, executionAgencyId: mutuelleGroups.executionAgencyId })
      if (!updated) throw new Error("Groupe introuvable")

      await tx.insert(auditEvents).values({
        agencyId: updated.executionAgencyId,
        actorUserId: user.id,
        entityType: "mutuelle_group",
        entityId: groupId,
        action: status === "active" ? "mutuelle_group.activated" : "mutuelle_group.suspended",
        diff: { status },
      })
    })
    revalidatePath("/admin/mutuelle")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

/* -------------------------------------------------------------------------- */
/* Invitation d'un directeur / membre                                          */
/* -------------------------------------------------------------------------- */

const inviteUserSchema = z.object({
  groupId: z.string().uuid(),
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(200),
  role: z.enum(["mutuelle_director", "mutuelle_member"]),
})

export type InviteMutuelleUserResult = { ok: true; userId: string } | { ok: false; error: string }

export async function inviteMutuelleUser(
  raw: z.infer<typeof inviteUserSchema>,
): Promise<InviteMutuelleUserResult> {
  const parsed = inviteUserSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  const defaultAgencyId = await getDefaultAgencyId()
  if (!defaultAgencyId) return { ok: false, error: "Agence OTA par défaut introuvable." }

  const admin = createServiceRoleSupabase()
  const invited = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { name: input.name },
  })
  if (invited.error || !invited.data.user) {
    return { ok: false, error: `Échec de l'invitation : ${invited.error?.message ?? "erreur inconnue"}` }
  }
  const newUserId = invited.data.user.id

  try {
    await withTenantContext(
      { agencyId: null, userId: user.id, isSuperAdmin: true },
      async (tx) => {
        const [group] = await tx
          .select({ id: mutuelleGroups.id, status: mutuelleGroups.status })
          .from(mutuelleGroups)
          .where(eq(mutuelleGroups.id, input.groupId))
          .limit(1)
        if (!group) throw new Error("Groupe Mutuelle introuvable")

        await tx.insert(users).values({
          id: newUserId,
          agencyId: defaultAgencyId,
          mutuelleGroupId: input.groupId,
          email: input.email,
          name: input.name,
          role: input.role,
          status: "active",
        })
        await tx.insert(auditEvents).values({
          agencyId: defaultAgencyId,
          actorUserId: user.id,
          entityType: "user",
          entityId: newUserId,
          action: "mutuelle_user.created",
          diff: { email: input.email, name: input.name, role: input.role, groupId: input.groupId },
        })
      },
    )
  } catch (err) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    const message = err instanceof Error ? err.message : "Erreur inconnue"
    return { ok: false, error: `Compte invité mais profil non créé (annulé) : ${message}` }
  }

  revalidatePath("/admin/mutuelle")
  return { ok: true, userId: newUserId }
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                      */
/* -------------------------------------------------------------------------- */

export interface MutuelleGroupRow {
  id: string
  slug: string
  name: string
  executionAgencyId: string
  executionAgencyName: string
  markupPercent: number
  conventionStartDate: string | null
  conventionEndDate: string | null
  status: string
  memberCount: number
  createdAt: Date
}

export async function listMutuelleGroups(): Promise<MutuelleGroupRow[]> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return []
  const { user } = auth

  return withTenantContext({ agencyId: null, userId: user.id, isSuperAdmin: true }, async (tx) => {
    const groups = await tx
      .select({
        id: mutuelleGroups.id,
        slug: mutuelleGroups.slug,
        name: mutuelleGroups.name,
        executionAgencyId: mutuelleGroups.executionAgencyId,
        executionAgencyName: agencies.name,
        markupPercent: mutuelleGroups.markupPercent,
        conventionStartDate: mutuelleGroups.conventionStartDate,
        conventionEndDate: mutuelleGroups.conventionEndDate,
        status: mutuelleGroups.status,
        createdAt: mutuelleGroups.createdAt,
      })
      .from(mutuelleGroups)
      .innerJoin(agencies, eq(agencies.id, mutuelleGroups.executionAgencyId))

    const memberCounts = await tx
      .select({ groupId: users.mutuelleGroupId, count: count(users.id) })
      .from(users)
      .where(and(eq(users.status, "active"), isNotNull(users.mutuelleGroupId)))
      .groupBy(users.mutuelleGroupId)

    const countByGroup = new Map<string, number>()
    for (const row of memberCounts) {
      if (!row.groupId) continue
      countByGroup.set(row.groupId, row.count)
    }

    return groups.map((g) => ({
      ...g,
      markupPercent: parseFloat(g.markupPercent),
      memberCount: countByGroup.get(g.id) ?? 0,
    }))
  })
}
