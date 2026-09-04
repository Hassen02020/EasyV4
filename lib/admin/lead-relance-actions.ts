"use server"

/**
 * CRM / Leads — Relance (étape 3/3, voir lead-relance-core.ts). Même garde
 * que lead-scoring-actions.ts : lecture pour tout le staff support, écriture
 * (seuil/interrupteur) réservée à super_admin/manager — configurer la
 * relance est une décision d'équipe, pas une tâche courante.
 */

import { revalidatePath } from "next/cache"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  getLeadRelanceSettingsCore,
  upsertLeadRelanceSettingsCore,
  type LeadRelanceSettingsValue,
} from "@/lib/crm/lead-relance-core"

const SUPPORT_STAFF_ROLES = ["super_admin", "manager", "agent_resa"] as const
const RELANCE_CONFIG_ROLES = ["super_admin", "manager"] as const

interface SupportStaffContext {
  userId: string
  agencyId: string
}

async function assertSupportStaff(allowed: readonly string[]): Promise<SupportStaffContext> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("NOT_AUTHENTICATED")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !profile.agencyId) throw new Error("FORBIDDEN")
  if (!allowed.includes(profile.role ?? "")) throw new Error("FORBIDDEN")
  if (profile.agencyType !== "ota") throw new Error("FORBIDDEN")

  return { userId: user.id, agencyId: profile.agencyId }
}

export type GetLeadRelanceSettingsResult =
  | { ok: true; settings: LeadRelanceSettingsValue }
  | { ok: false; error: string }

export async function getLeadRelanceSettings(): Promise<GetLeadRelanceSettingsResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff(SUPPORT_STAFF_ROLES)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    const settings = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) => getLeadRelanceSettingsCore(tx, { agencyId: ctx.agencyId }),
    )
    return { ok: true, settings }
  } catch (err) {
    console.error("[getLeadRelanceSettings]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type UpdateLeadRelanceSettingsResult = { ok: true } | { ok: false; error: string }

export async function updateLeadRelanceSettings(input: {
  thresholdDays: number
  isEnabled: boolean
}): Promise<UpdateLeadRelanceSettingsResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff(RELANCE_CONFIG_ROLES)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  if (!Number.isFinite(input.thresholdDays) || input.thresholdDays < 1 || input.thresholdDays > 90) {
    return { ok: false, error: "Délai invalide (1 à 90 jours)." }
  }

  try {
    await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      upsertLeadRelanceSettingsCore(tx, {
        agencyId: ctx.agencyId,
        thresholdDays: Math.round(input.thresholdDays),
        isEnabled: input.isEnabled,
      }),
    )
    revalidatePath("/admin/support")
    return { ok: true }
  } catch (err) {
    console.error("[updateLeadRelanceSettings]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
