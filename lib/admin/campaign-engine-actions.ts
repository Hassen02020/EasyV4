"use server"

/**
 * CAMPAIGN-ENGINE-01 — Server Action publique.
 *
 * Orchestre :
 *   getTimeSeriesCore → buildRadarMetierCore  (signals marché)
 *   listLeadsCore → score + résolution contact  (acteurs VIP)
 *   buildSignalEngineCore  (convergence)
 *   buildActionEngineCore  (recommandations)
 *   buildCampaignEngineCore  (proposals de campagnes)
 *
 * Même patron auth/tenant que signal-engine-actions.ts.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getTimeSeriesCore } from "@/lib/crm/time-series-core"
import { buildRadarMetierCore } from "@/lib/crm/radar-metier-core"
import { listLeadsCore } from "@/lib/crm/leads-core"
import {
  getVipScoreForLeadCore,
  findExistingContactIdForLeadCore,
  DEFAULT_VIP_SCORE_WEIGHTS,
} from "@/lib/crm/vip-score-core"
import { getLeadScoreRuleMapCore } from "@/lib/crm/lead-scoring-core"
import {
  buildSignalEngineCore,
  type VipInput,
} from "@/lib/crm/signal-engine-core"
import { buildActionEngineCore } from "@/lib/crm/action-engine-core"
import {
  buildCampaignEngineCore,
  type CampaignProposal,
} from "@/lib/crm/campaign-engine-core"

export type { CampaignProposal }

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

export type GetCampaignEngineResult =
  | { ok: true; proposals: CampaignProposal[]; windowWeeks: number }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Public Server Action                                                        */
/* -------------------------------------------------------------------------- */

export async function getCampaignEngine(
  windowWeeks: 4 | 8 | 12 = 4,
): Promise<GetCampaignEngineResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  try {
    const proposals = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        // 1. Signaux marché
        const timeSeriesRows = await getTimeSeriesCore(tx, {
          agencyId: ctx.agencyId,
          windowWeeks,
        })
        const radarSignals = buildRadarMetierCore(timeSeriesRows)

        // 2. Acteurs VIP
        const scoreRules = await getLeadScoreRuleMapCore(tx, {
          agencyId: ctx.agencyId,
        })
        const leads = await listLeadsCore(tx, { agencyId: ctx.agencyId })

        const vipInputs: VipInput[] = []
        for (const lead of leads) {
          const result = await getVipScoreForLeadCore(tx, {
            agencyId: ctx.agencyId,
            leadId: lead.id,
            scoreRules,
            weights: DEFAULT_VIP_SCORE_WEIGHTS,
          })
          if (!result) continue

          const contactId = await findExistingContactIdForLeadCore(tx, {
            agencyId: ctx.agencyId,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
          })

          vipInputs.push({
            leadId: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName ?? null,
            contactId,
            vipScore: result.score.total,
            leadCount: 1,
            destination: lead.destination ?? null,
            products: [lead.productType],
          })
        }

        // 3. Déduplication contactuelle
        const groups = new Map<string, VipInput>()
        for (const vip of vipInputs) {
          const key = vip.contactId ?? `lead:${vip.leadId}`
          const existing = groups.get(key)
          if (!existing) {
            groups.set(key, { ...vip })
          } else {
            if (vip.destination && !existing.destination) {
              existing.destination = vip.destination
            }
            if (!existing.products.includes(vip.products[0])) {
              existing.products.push(vip.products[0])
            }
            existing.leadCount += 1
            if (vip.vipScore > existing.vipScore) {
              groups.set(key, {
                ...vip,
                destination: existing.destination,
                products: existing.products,
                leadCount: existing.leadCount,
              })
            }
          }
        }

        // 4. Signal Engine
        const signals = buildSignalEngineCore(
          Array.from(groups.values()),
          radarSignals,
        )

        // 5. Action Engine
        const actions = buildActionEngineCore(signals)

        // 6. Campaign Engine
        return buildCampaignEngineCore(actions)
      },
    )
    return { ok: true, proposals, windowWeeks }
  } catch (err) {
    console.error("[getCampaignEngine]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
