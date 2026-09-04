"use server"

/**
 * CRM / Leads — Scoring (étape 2/3, voir lead-scoring-core.ts). Même garde
 * que leads-actions.ts (assertSupportStaff : super_admin/manager/agent_resa,
 * agence OTA uniquement), SAUF pour l'écriture des poids : configurer le
 * scoring est une décision d'équipe, pas une tâche courante — réservée à
 * super_admin/manager, même distinction que ALLOWED_ROLES vs des rôles de
 * config plus étroits ailleurs dans ce projet (ex. pricing_margins).
 */

import { revalidatePath } from "next/cache"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  getLeadScoreRuleMapCore,
  upsertLeadScoreRuleCore,
  LEAD_SCORE_SIGNALS,
  type LeadScoreRuleMap,
  type LeadScoreSignal,
} from "@/lib/crm/lead-scoring-core"

const SUPPORT_STAFF_ROLES = ["super_admin", "manager", "agent_resa"] as const
const SCORING_CONFIG_ROLES = ["super_admin", "manager"] as const

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

export type GetLeadScoreRulesResult = { ok: true; rules: LeadScoreRuleMap } | { ok: false; error: string }

export async function getLeadScoreRules(): Promise<GetLeadScoreRulesResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff(SUPPORT_STAFF_ROLES)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    const rules = await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      getLeadScoreRuleMapCore(tx, { agencyId: ctx.agencyId }),
    )
    return { ok: true, rules }
  } catch (err) {
    console.error("[getLeadScoreRules]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type UpdateLeadScoreRuleResult = { ok: true } | { ok: false; error: string }

export async function updateLeadScoreRule(input: {
  signal: LeadScoreSignal
  points: number
  isActive: boolean
}): Promise<UpdateLeadScoreRuleResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff(SCORING_CONFIG_ROLES)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  if (!(LEAD_SCORE_SIGNALS as readonly string[]).includes(input.signal)) {
    return { ok: false, error: "Signal invalide." }
  }
  if (!Number.isFinite(input.points) || input.points < 0 || input.points > 1000) {
    return { ok: false, error: "Points invalides (0 à 1000)." }
  }

  try {
    await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      upsertLeadScoreRuleCore(tx, {
        agencyId: ctx.agencyId,
        signal: input.signal,
        points: Math.round(input.points),
        isActive: input.isActive,
      }),
    )
    revalidatePath("/admin/support")
    return { ok: true }
  } catch (err) {
    console.error("[updateLeadScoreRule]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
