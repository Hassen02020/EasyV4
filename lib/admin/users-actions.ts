"use server"

/**
 * Gestion réelle du personnel Easy2Book (OTA) — Phase 18.
 *
 * `app/admin/staff/page.tsx` listait déjà le personnel réel, mais aucune
 * Server Action n'existait pour créer un compte, changer son statut ou son
 * rôle — `components/admin/staff-row-actions.tsx` affichait un toast
 * explicite admettant qu'aucun changement n'avait lieu. Ce fichier fournit
 * les trois actions réelles correspondantes.
 *
 * RBAC : même frontière que la policy RLS `users_manager_insert` /
 * `users_manager_update` (drizzle/manual/0001_rls_policies.sql +
 * 0028_fix_users_manager_write_recursion.sql) — seuls `manager` et
 * `super_admin` peuvent écrire dans `users`, toujours scopé à LEUR PROPRE
 * agence (jamais un agencyId fourni par le client). La vérification
 * applicative ci-dessous est une défense en profondeur : même si elle
 * était contournée, RLS refuserait la mutation.
 *
 * Création de compte : passe par l'API Admin Supabase
 * (`createServiceRoleSupabase().auth.admin.inviteUserByEmail`) — `users.id`
 * DOIT correspondre à `auth.users.id` (voir lib/db/schema.ts), donc créer
 * seulement la ligne `users` sans compte Auth réel produirait un compte
 * inutilisable (jamais connectable). Si l'insertion `users` échoue après
 * la création Auth, le compte Auth orphelin est supprimé pour ne pas
 * laisser une identité sans profil.
 */

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { auditEvents, users } from "@/lib/db/schema"
import { createServerSupabase, createServiceRoleSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { ADMIN_ROLES, isAllowedIntoAdmin, type AdminRole } from "@/lib/auth/admin-gate"
import { checkNotSelfTarget, checkRoleChangeAllowed } from "./users-logic"

const STAFF_MANAGE_ALLOWED_ROLES = ["super_admin", "manager"] as const

async function requireStaffManagerProfile() {
  if (!process.env.DATABASE_URL) {
    return { ok: false as const, error: "Base de données non configurée" }
  }
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !isAllowedIntoAdmin(profile.role, profile.agencyType)) {
    return { ok: false as const, error: "Profil administrateur introuvable" }
  }
  if (!(STAFF_MANAGE_ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
    return { ok: false as const, error: "Votre rôle n'est pas autorisé à gérer le personnel." }
  }
  return { ok: true as const, user, profile }
}

/* ---------------------------------------------------------------------- */
/* Création                                                                */
/* ---------------------------------------------------------------------- */

const createInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.enum(ADMIN_ROLES),
})

export type CreateStaffUserResult =
  | { ok: true; userId: string }
  | { ok: false; error: string }

export async function createStaffUser(
  raw: z.infer<typeof createInputSchema>,
): Promise<CreateStaffUserResult> {
  const parsed = createInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  const auth = await requireStaffManagerProfile()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user, profile } = auth

  // Seul un super_admin peut créer un autre super_admin — un manager ne
  // peut jamais s'auto-élever ni élever un tiers au rang plateforme.
  const roleCheck = checkRoleChangeAllowed({
    actorRole: profile.role,
    actorUserId: user.id,
    targetUserId: "new-user", // pas encore créé — jamais égal à user.id
    nextRole: input.role,
  })
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error }

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
      { agencyId: profile.agencyId, userId: user.id, isSuperAdmin: profile.role === "super_admin" },
      async (tx) => {
        await tx.insert(users).values({
          id: newUserId,
          agencyId: profile.agencyId,
          email: input.email,
          name: input.name,
          role: input.role,
          status: "active",
        })
        await tx.insert(auditEvents).values({
          agencyId: profile.agencyId,
          actorUserId: user.id,
          entityType: "user",
          entityId: newUserId,
          action: "user.created",
          diff: { email: input.email, name: input.name, role: input.role },
        })
      },
    )
  } catch (err) {
    // Compte Auth orphelin (aucune ligne `users`) : jamais utilisable
    // (RLS/resolve_session_context ne trouvera aucun profil) — on le
    // supprime plutôt que de laisser une identité fantôme.
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    const message = err instanceof Error ? err.message : "Erreur inconnue"
    return { ok: false, error: `Compte invité mais profil non créé (annulé) : ${message}` }
  }

  revalidatePath("/admin/staff")
  return { ok: true, userId: newUserId }
}

/* ---------------------------------------------------------------------- */
/* Statut (activer / désactiver)                                          */
/* ---------------------------------------------------------------------- */

const statusInputSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
})

export type SetUserStatusResult = { ok: true } | { ok: false; error: string }

export async function setUserStatus(
  raw: z.infer<typeof statusInputSchema>,
): Promise<SetUserStatusResult> {
  const parsed = statusInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Entrée invalide" }
  const input = parsed.data

  const auth = await requireStaffManagerProfile()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user, profile } = auth

  const selfCheck = checkNotSelfTarget({ actorUserId: user.id, targetUserId: input.userId })
  if (!selfCheck.ok) return { ok: false, error: selfCheck.error }

  const outcome = await withTenantContext(
    { agencyId: profile.agencyId, userId: user.id, isSuperAdmin: profile.role === "super_admin" },
    async (tx) => {
      const [target] = await tx
        .select({ id: users.id, email: users.email, status: users.status })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.agencyId, profile.agencyId)))
        .limit(1)
      if (!target) return { ok: false as const, error: "Utilisateur introuvable dans votre agence." }

      await tx.update(users).set({ status: input.status }).where(eq(users.id, input.userId))

      await tx.insert(auditEvents).values({
        agencyId: profile.agencyId,
        actorUserId: user.id,
        entityType: "user",
        entityId: input.userId,
        action: "user.status_changed",
        diff: { email: target.email, from: target.status, to: input.status },
      })

      return { ok: true as const }
    },
  )

  if (outcome.ok) revalidatePath("/admin/staff")
  return outcome
}

/* ---------------------------------------------------------------------- */
/* Rôle                                                                    */
/* ---------------------------------------------------------------------- */

const roleInputSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ADMIN_ROLES),
})

export type SetUserRoleResult = { ok: true } | { ok: false; error: string }

export async function setUserRole(
  raw: z.infer<typeof roleInputSchema>,
): Promise<SetUserRoleResult> {
  const parsed = roleInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Entrée invalide" }
  const input = parsed.data

  const auth = await requireStaffManagerProfile()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user, profile } = auth

  const preCheck = checkRoleChangeAllowed({
    actorRole: profile.role,
    actorUserId: user.id,
    targetUserId: input.userId,
    nextRole: input.role,
  })
  if (!preCheck.ok) return { ok: false, error: preCheck.error }

  const outcome = await withTenantContext(
    { agencyId: profile.agencyId, userId: user.id, isSuperAdmin: profile.role === "super_admin" },
    async (tx) => {
      const [target] = await tx
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.agencyId, profile.agencyId)))
        .limit(1)
      if (!target) return { ok: false as const, error: "Utilisateur introuvable dans votre agence." }

      const targetCheck = checkRoleChangeAllowed({
        actorRole: profile.role,
        actorUserId: user.id,
        targetUserId: input.userId,
        targetCurrentRole: target.role,
        nextRole: input.role,
      })
      if (!targetCheck.ok) return { ok: false as const, error: targetCheck.error }

      await tx.update(users).set({ role: input.role as AdminRole }).where(eq(users.id, input.userId))

      await tx.insert(auditEvents).values({
        agencyId: profile.agencyId,
        actorUserId: user.id,
        entityType: "user",
        entityId: input.userId,
        action: "user.role_changed",
        diff: { email: target.email, from: target.role, to: input.role },
      })

      return { ok: true as const }
    },
  )

  if (outcome.ok) revalidatePath("/admin/staff")
  return outcome
}
