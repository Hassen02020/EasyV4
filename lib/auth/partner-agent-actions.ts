"use server"

/**
 * Gestion (statut) d'un partner_agent par son partner_owner — Phase 22.
 *
 * Preuve d'usage concrète du modèle de délégation (lib/auth/permission-
 * actions.ts) : sans le grant explicite "staff.edit", cette action échoue
 * — jamais un droit automatique du seul rôle partner_owner ("Partner Owner
 * may manage Partner Agents only if explicitly authorized"). S'appuie sur
 * la policy RLS users_manager_update élargie (migration 0032) — condition
 * NÉCESSAIRE mais pas SUFFISANTE : le vrai gate est la vérification du
 * grant ci-dessous, RLS n'est que la frontière tenant+rôle large.
 *
 * Volontairement limité au statut (activer/suspendre) — la création de
 * compte (invitation Supabase Auth réelle) reste hors périmètre Phase 22,
 * voir le rapport final ("remaining gaps").
 */

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { auditEvents, users } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "./partner-profile"
import { getEffectivePermission } from "./permissions"

const inputSchema = z.object({
  targetUserId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
})

export type SetPartnerAgentStatusResult = { ok: true } | { ok: false; error: string }

export async function setPartnerAgentStatus(
  raw: z.infer<typeof inputSchema>,
): Promise<SetPartnerAgentStatusResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Entrée invalide" }
  const input = parsed.data

  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée" }

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile || profile.role !== "partner_owner") {
    return { ok: false, error: "Réservé au propriétaire de l'agence." }
  }
  if (input.targetUserId === user.id) {
    return { ok: false, error: "Vous ne pouvez pas changer votre propre statut." }
  }

  const authorized = await getEffectivePermission({
    agencyId: profile.agency.id,
    userId: user.id,
    role: "partner_owner",
    permission: "staff.edit",
  })
  if (!authorized) {
    return {
      ok: false,
      error: "Vous n'êtes pas autorisé à gérer les agents de votre agence — contactez Easy2Book.",
    }
  }

  const outcome = await withTenantContext(
    { agencyId: profile.agency.id, userId: user.id, isSuperAdmin: false },
    async (tx) => {
      const [target] = await tx
        .select({ id: users.id, email: users.email, role: users.role, status: users.status })
        .from(users)
        .where(and(eq(users.id, input.targetUserId), eq(users.agencyId, profile.agency.id)))
        .limit(1)
      if (!target) return { ok: false as const, error: "Agent introuvable dans votre agence." }
      if (target.role !== "partner_agent") {
        return { ok: false as const, error: "Vous ne pouvez gérer que des partner_agent." }
      }

      await tx.update(users).set({ status: input.status }).where(eq(users.id, input.targetUserId))

      await tx.insert(auditEvents).values({
        agencyId: profile.agency.id,
        actorUserId: user.id,
        entityType: "user",
        entityId: input.targetUserId,
        action: "user.status_changed",
        diff: { email: target.email, from: target.status, to: input.status, via: "partner_owner_delegation" },
      })

      return { ok: true as const }
    },
  )

  if (outcome.ok) revalidatePath("/pro/utilisateurs")
  return outcome
}
