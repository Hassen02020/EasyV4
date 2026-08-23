"use server"

/**
 * Délégation de permission (Phase 22) — Master Admin décide quelles
 * responsabilités opérationnelles sont déléguées au personnel OTA et, si
 * explicitement autorisé, à un Partner Owner pour ses propres agents.
 *
 * Deux acteurs possibles, jamais un rôle/une agence fournie par le client :
 *  - super_admin (résolu via getCurrentAdminProfile) : autorité globale,
 *    peut accorder/révoquer N'IMPORTE QUELLE permission à N'IMPORTE QUEL
 *    utilisateur, dans N'IMPORTE QUELLE agence — jamais restreint (mission
 *    Phase 22 : "super_admin remains globally authorized").
 *  - partner_owner (résolu via getCurrentPartnerProfile) : ne peut déléguer
 *    QUE s'il détient LUI-MÊME le grant explicite "staff.edit" (jamais un
 *    droit automatique du seul rôle — voir lib/auth/permissions.ts), et
 *    uniquement : (a) à un `partner_agent` de SA PROPRE agence, jamais un
 *    autre owner/manager/super_admin, jamais une autre agence ; (b) parmi
 *    PARTNER_DELEGATABLE_PERMISSIONS uniquement (jamais "staff.", "admin."
 *    ou "accounting.refunds." — un agent ne peut jamais recevoir, même par ce
 *    biais, de quoi gérer des utilisateurs ou approuver un remboursement).
 *
 * Ne touche JAMAIS `users.role` — structurellement impossible de s'en
 * servir pour une élévation de privilège (devenir manager/super_admin) :
 * cette action ne modifie que `permission_grants`.
 */

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { auditEvents, permissionGrants, users } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "./profile"
import { getCurrentPartnerProfile } from "./partner-profile"
import { getEffectivePermission, PARTNER_DELEGATABLE_PERMISSIONS } from "./permissions"
import { RBAC_PERMISSIONS } from "./rbac-permission-list"

const inputSchema = z.object({
  targetUserId: z.string().uuid(),
  permission: z.enum(RBAC_PERMISSIONS),
  granted: z.boolean(),
})

export type SetDelegatedPermissionInput = z.infer<typeof inputSchema>
export type SetDelegatedPermissionResult = { ok: true } | { ok: false; error: string }

export async function setDelegatedPermission(
  raw: SetDelegatedPermissionInput,
): Promise<SetDelegatedPermissionResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Entrée invalide" }
  const input = parsed.data

  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée" }

  if (input.targetUserId === user.id) {
    return { ok: false, error: "Vous ne pouvez pas modifier vos propres permissions." }
  }

  // --- Acteur super_admin : autorité globale, jamais restreinte. ---
  const adminProfile = await getCurrentAdminProfile(user.id)
  if (adminProfile?.role === "super_admin") {
    const target = await withTenantContext(
      { agencyId: null, userId: user.id, isSuperAdmin: true },
      (tx) =>
        tx
          .select({ id: users.id, agencyId: users.agencyId, role: users.role })
          .from(users)
          .where(eq(users.id, input.targetUserId))
          .limit(1),
    )
    const targetRow = target[0]
    if (!targetRow) return { ok: false, error: "Utilisateur cible introuvable." }

    return applyGrant({
      agencyId: targetRow.agencyId,
      actorUserId: user.id,
      isSuperAdmin: true,
      targetUserId: input.targetUserId,
      permission: input.permission,
      granted: input.granted,
    })
  }

  // --- Acteur partner_owner : délégation restreinte, seulement si lui-même autorisé. ---
  const partnerProfile = await getCurrentPartnerProfile(user.id)
  if (partnerProfile?.role === "partner_owner") {
    const canDelegate = await getEffectivePermission({
      agencyId: partnerProfile.agency.id,
      userId: user.id,
      role: "partner_owner",
      permission: "staff.edit",
    })
    if (!canDelegate) {
      return {
        ok: false,
        error: "Vous n'êtes pas autorisé à déléguer des permissions — contactez Easy2Book.",
      }
    }
    if (!(PARTNER_DELEGATABLE_PERMISSIONS as readonly string[]).includes(input.permission)) {
      return { ok: false, error: "Cette permission ne peut pas être déléguée à un agent." }
    }

    const target = await withTenantContext(
      { agencyId: partnerProfile.agency.id, userId: user.id, isSuperAdmin: false },
      (tx) =>
        tx
          .select({ id: users.id, agencyId: users.agencyId, role: users.role })
          .from(users)
          .where(and(eq(users.id, input.targetUserId), eq(users.agencyId, partnerProfile.agency.id)))
          .limit(1),
    )
    const targetRow = target[0]
    if (!targetRow) return { ok: false, error: "Agent introuvable dans votre agence." }
    if (targetRow.role !== "partner_agent") {
      return { ok: false, error: "Vous ne pouvez déléguer des permissions qu'à un partner_agent." }
    }

    return applyGrant({
      agencyId: partnerProfile.agency.id,
      actorUserId: user.id,
      isSuperAdmin: false,
      targetUserId: input.targetUserId,
      permission: input.permission,
      granted: input.granted,
    })
  }

  return { ok: false, error: "Votre rôle n'est pas autorisé à déléguer des permissions." }
}

async function applyGrant(input: {
  agencyId: string
  actorUserId: string
  isSuperAdmin: boolean
  targetUserId: string
  permission: string
  granted: boolean
}): Promise<SetDelegatedPermissionResult> {
  await withTenantContext(
    { agencyId: input.isSuperAdmin ? null : input.agencyId, userId: input.actorUserId, isSuperAdmin: input.isSuperAdmin },
    async (tx) => {
      const [existing] = await tx
        .select({ granted: permissionGrants.granted })
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.agencyId, input.agencyId),
            eq(permissionGrants.userId, input.targetUserId),
            eq(permissionGrants.permission, input.permission),
          ),
        )
        .limit(1)

      await tx
        .insert(permissionGrants)
        .values({
          agencyId: input.agencyId,
          userId: input.targetUserId,
          permission: input.permission,
          granted: input.granted,
          grantedByUserId: input.actorUserId,
        })
        .onConflictDoUpdate({
          target: [permissionGrants.agencyId, permissionGrants.userId, permissionGrants.permission],
          set: { granted: input.granted, grantedByUserId: input.actorUserId, updatedAt: new Date() },
        })

      await tx.insert(auditEvents).values({
        agencyId: input.agencyId,
        actorUserId: input.actorUserId,
        entityType: "user",
        entityId: input.targetUserId,
        action: input.granted ? "permission.granted" : "permission.revoked",
        diff: {
          permission: input.permission,
          oldValue: existing ? existing.granted : null,
          newValue: input.granted,
        },
      })
    },
  )

  revalidatePath("/admin/staff")
  revalidatePath("/pro/utilisateurs")
  return { ok: true }
}
