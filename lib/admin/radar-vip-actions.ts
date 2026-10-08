"use server"

/**
 * RADAR-VIP-01 — "Qui devient important ?"
 *
 * Vue population : score VIP calculé sur les N leads les plus récents de
 * l'agence, classés par score décroissant. Réutilise intégralement
 * getVipScoreForLeadCore (lib/crm/vip-score-core.ts) — aucun nouveau
 * calcul, aucune nouvelle vérité.
 *
 * Portée délibérément limitée : on score les 200 leads les plus récents,
 * on retourne les 50 meilleurs. Performance acceptable sans cache ni
 * table matérialisée (scores calculés à la demande, jamais persistés —
 * conforme à la décision VIP-SCORE-01). Un chantier séparé (persistance
 * ou pagination) peut être décidé après observation de la distribution
 * réelle des scores.
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
  type VipScore,
} from "@/lib/crm/vip-score-core"
import { getLeadScoreRuleMapCore } from "@/lib/crm/lead-scoring-core"

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

export interface VipRadarRow {
  leadId: string
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  productType: string
  channel: string | null
  destination: string | null
  status: string
  score: VipScore
}

export type GetRadarVipResult =
  | { ok: true; rows: VipRadarRow[]; total: number }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Public Server Action                                                        */
/* -------------------------------------------------------------------------- */

export async function getRadarVip(): Promise<GetRadarVipResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  try {
    const rows = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        // 1. Charger les règles de scoring de qualité
        const scoreRules = await getLeadScoreRuleMapCore(tx, {
          agencyId: ctx.agencyId,
        })

        // 2. Lister les leads récents (listLeadsCore plafonne à 200)
        const leads = await listLeadsCore(tx, { agencyId: ctx.agencyId })

        // 3. Scorer chaque lead (séquentiel pour éviter N requêtes simultanées)
        const scored: VipRadarRow[] = []
        for (const lead of leads) {
          const result = await getVipScoreForLeadCore(tx, {
            agencyId: ctx.agencyId,
            leadId: lead.id,
            scoreRules,
            weights: DEFAULT_VIP_SCORE_WEIGHTS,
          })
          if (!result) continue
          scored.push({
            leadId: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName ?? null,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
            productType: lead.productType,
            channel: lead.channel ?? null,
            destination: lead.destination ?? null,
            status: lead.status,
            score: result.score,
          })
        }

        // 4. Trier par score décroissant, garder top 50
        scored.sort((a, b) => b.score.total - a.score.total)
        return scored.slice(0, 50)
      },
    )
    return { ok: true, rows, total: rows.length }
  } catch (err) {
    console.error("[getRadarVip]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
