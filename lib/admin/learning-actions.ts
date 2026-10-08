"use server"

/**
 * LEARNING-01 — Server Action publique.
 *
 * Orchestre :
 *   listLeadsCore → leads fenêtrés
 *   getVipScoreForLeadCore → score VIP par lead
 *   buildLearningCore → statistiques de conversion
 *
 * Même patron auth/tenant que les autres actions admin/analytics/*.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { listLeadsCore } from "@/lib/crm/leads-core"
import {
  getVipScoreForLeadCore,
  DEFAULT_VIP_SCORE_WEIGHTS,
} from "@/lib/crm/vip-score-core"
import { getLeadScoreRuleMapCore } from "@/lib/crm/lead-scoring-core"
import {
  buildLearningCore,
  type LearningStats,
  type LeadWithScore,
} from "@/lib/crm/learning-core"

export type { LearningStats }

/* -------------------------------------------------------------------------- */
/* Auth guard                                                                  */
/* -------------------------------------------------------------------------- */

const SUPPORT_STAFF_ROLES = ["super_admin", "manager", "agent_resa"] as const

interface SupportStaffContext {
  userId: string
  agencyId: string
}

async function assertSupportStaff(): Promise<SupportStaffContext> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("NOT_AUTHENTICATED")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !profile.agencyId) throw new Error("FORBIDDEN")
  if (
    !(SUPPORT_STAFF_ROLES as readonly string[]).includes(profile.role ?? "")
  ) {
    throw new Error("FORBIDDEN")
  }
  if (profile.agencyType !== "ota") throw new Error("FORBIDDEN")

  return { userId: user.id, agencyId: profile.agencyId }
}

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type GetLearningResult =
  | { ok: true; stats: LearningStats }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Public Server Action                                                        */
/* -------------------------------------------------------------------------- */

export async function getLearning(
  windowWeeks: 4 | 8 | 12 = 4,
): Promise<GetLearningResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  try {
    const stats = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - windowWeeks * 7)

        const allLeads = await listLeadsCore(tx, { agencyId: ctx.agencyId })
        const leadsInWindow = allLeads.filter((l) => l.createdAt >= cutoff)

        const scoreRules = await getLeadScoreRuleMapCore(tx, {
          agencyId: ctx.agencyId,
        })

        const scored: LeadWithScore[] = []
        for (const lead of leadsInWindow) {
          const result = await getVipScoreForLeadCore(tx, {
            agencyId: ctx.agencyId,
            leadId: lead.id,
            scoreRules,
            weights: DEFAULT_VIP_SCORE_WEIGHTS,
          })
          scored.push({
            id: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName ?? null,
            vipScore: result?.score.total ?? 0,
            status: lead.status,
            productType: lead.productType,
            destination: lead.destination ?? null,
            createdAt: lead.createdAt,
            convertedAt: lead.convertedAt ?? null,
          })
        }

        return buildLearningCore(scored, windowWeeks)
      },
    )
    return { ok: true, stats }
  } catch (err) {
    console.error("[getLearning]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
