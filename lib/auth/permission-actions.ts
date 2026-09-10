"use server"

/**
 * Délégation de permission (Phase 22, UI Phase 23) — Master Admin décide
 * quelles responsabilités opérationnelles sont déléguées au personnel OTA
 * et, si explicitement autorisé, à un Partner Owner pour ses propres
 * agents.
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
 * La décision d'autorisation elle-même vit dans `permission-grants-logic.ts`
 * (pure, testable sans DB) — ce fichier ne fait que résoudre l'identité
 * serveur (session Supabase, profils) et appliquer la décision en DB.
 *
 * Ne touche JAMAIS `users.role` — structurellement impossible de s'en
 * servir pour une élévation de privilège (devenir manager/super_admin) :
 * ces actions ne modifient que `permission_grants`.
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
import { checkDelegationAllowed } from "./permission-grants-logic"
import { RBAC_PERMISSIONS } from "./rbac-permission-list"

const targetPermissionSchema = z.object({
  targetUserId: z.string().uuid(),
  permission: z.enum(RBAC_PERMISSIONS),
})

const grantInputSchema = targetPermissionSchema.extend({
  granted: z.boolean(),
})

export type SetDelegatedPermissionInput = z.infer<typeof grantInputSchema>
export type SetDelegatedPermissionResult = { ok: true } | { ok: false; error: string }

type ResolvedActor =
  | { ok: true; agencyId: string; actorUserId: string; isSuperAdmin: boolean }
  | { ok: false; error: string }

/**
 * Résout l'acteur (super_admin ou partner_owner autorisé) et vérifie que la
 * délégation demandée est permise — jamais de rôle/agence fourni par le
 * client, tout est relu depuis la session Supabase + la DB.
 */
async function resolveDelegationActor(input: {
  actorUserId: string
  targetUserId: string
  permission: (typeof RBAC_PERMISSIONS)[number]
}): Promise<ResolvedActor> {
  const adminProfile = await getCurrentAdminProfile(input.actorUserId)
  if (adminProfile?.role === "super_admin") {
    const target = await withTenantContext(
      { agencyId: null, userId: input.actorUserId, isSuperAdmin: true },
      (tx) =>
        tx
          .select({ id: users.id, agencyId: users.agencyId })
          .from(users)
          .where(eq(users.id, input.targetUserId))
          .limit(1),
    )
    const targetRow = target[0]
    const check = checkDelegationAllowed({
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      actorIsSuperAdmin: true,
      actorHasStaffEdit: true, // sans objet pour super_admin (autorité globale)
      targetRole: null,
      targetFound: !!targetRow,
      permission: input.permission,
      delegatablePermissions: RBAC_PERMISSIONS,
    })
    if (!check.ok) return check
    return { ok: true, agencyId: targetRow!.agencyId, actorUserId: input.actorUserId, isSuperAdmin: true }
  }

  const partnerProfile = await getCurrentPartnerProfile(input.actorUserId)
  if (partnerProfile?.role === "partner_owner") {
    const actorHasStaffEdit = await getEffectivePermission({
      agencyId: partnerProfile.agency.id,
      userId: input.actorUserId,
      role: "partner_owner",
      permission: "staff.edit",
    })

    const target = await withTenantContext(
      { agencyId: partnerProfile.agency.id, userId: input.actorUserId, isSuperAdmin: false },
      (tx) =>
        tx
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(and(eq(users.id, input.targetUserId), eq(users.agencyId, partnerProfile.agency.id)))
          .limit(1),
    )
    const targetRow = target[0]
    const check = checkDelegationAllowed({
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      actorIsSuperAdmin: false,
      actorHasStaffEdit,
      targetRole: targetRow?.role ?? null,
      targetFound: !!targetRow,
      permission: input.permission,
      delegatablePermissions: PARTNER_DELEGATABLE_PERMISSIONS,
    })
    if (!check.ok) return check
    return { ok: true, agencyId: partnerProfile.agency.id, actorUserId: input.actorUserId, isSuperAdmin: false }
  }

  return { ok: false, error: "Votre rôle n'est pas autorisé à déléguer des permissions." }
}

async function resolveActorForRequest(
  rawTargetUserId: string,
  rawPermission: (typeof RBAC_PERMISSIONS)[number],
): Promise<ResolvedActor> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée" }

  return resolveDelegationActor({
    actorUserId: user.id,
    targetUserId: rawTargetUserId,
    permission: rawPermission,
  })
}

export async function setDelegatedPermission(
  raw: SetDelegatedPermissionInput,
): Promise<SetDelegatedPermissionResult> {
  const parsed = grantInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Entrée invalide" }
  const input = parsed.data
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const resolved = await resolveActorForRequest(input.targetUserId, input.permission)
  if (!resolved.ok) return resolved

  return applyGrant({
    agencyId: resolved.agencyId,
    actorUserId: resolved.actorUserId,
    isSuperAdmin: resolved.isSuperAdmin,
    targetUserId: input.targetUserId,
    permission: input.permission,
    granted: input.granted,
  })
}

export async function removeDelegatedPermission(
  raw: z.infer<typeof targetPermissionSchema>,
): Promise<SetDelegatedPermissionResult> {
  const parsed = targetPermissionSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Entrée invalide" }
  const input = parsed.data
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const resolved = await resolveActorForRequest(input.targetUserId, input.permission)
  if (!resolved.ok) return resolved

  return applyRemoval({
    agencyId: resolved.agencyId,
    actorUserId: resolved.actorUserId,
    isSuperAdmin: resolved.isSuperAdmin,
    targetUserId: input.targetUserId,
    permission: input.permission,
  })
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

async function applyRemoval(input: {
  agencyId: string
  actorUserId: string
  isSuperAdmin: boolean
  targetUserId: string
  permission: string
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
      if (!existing) return // rien à retirer — idempotent

      await tx
        .delete(permissionGrants)
        .where(
          and(
            eq(permissionGrants.agencyId, input.agencyId),
            eq(permissionGrants.userId, input.targetUserId),
            eq(permissionGrants.permission, input.permission),
          ),
        )

      await tx.insert(auditEvents).values({
        agencyId: input.agencyId,
        actorUserId: input.actorUserId,
        entityType: "user",
        entityId: input.targetUserId,
        action: "permission.override_removed",
        diff: {
          permission: input.permission,
          oldValue: existing.granted,
          newValue: null,
        },
      })
    },
  )

  revalidatePath("/admin/staff")
  revalidatePath("/pro/utilisateurs")
  return { ok: true }
}
