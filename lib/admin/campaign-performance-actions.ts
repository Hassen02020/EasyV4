"use server"

/**
 * CAMPAIGN-PERF-UI-01 — exposition staff OTA des performances CRM
 * par campagne. Jusqu'ici getCampaignPerformanceCore() (commit 155d540)
 * calculait exposés/convertis/CA/marge mais aucune interface ne le lisait.
 *
 * Même patron que lib/admin/niche-actions.ts :
 * assertSupportStaff() → withTenantContext → core function.
 * agencyId toujours résolu serveur (jamais fourni par l'appelant).
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { eq } from "drizzle-orm"
import { campaigns } from "@/lib/db/schema"
import {
  getCampaignPerformanceCore,
  type CampaignPerformance,
} from "@/lib/crm/campaign-performance-core"

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

export interface CampaignPerformanceRow extends CampaignPerformance {
  name: string
  channel: string
  status: string
}

export type ListCampaignPerformanceResult =
  | { ok: true; rows: CampaignPerformanceRow[] }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Public Server Action                                                        */
/* -------------------------------------------------------------------------- */

export async function listCampaignPerformance(): Promise<ListCampaignPerformanceResult> {
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
        const campaignList = await tx
          .select({
            id: campaigns.id,
            name: campaigns.name,
            channel: campaigns.channel,
            status: campaigns.status,
          })
          .from(campaigns)
          .where(eq(campaigns.agencyId, ctx.agencyId))

        return Promise.all(
          campaignList.map(async (c) => {
            const perf = await getCampaignPerformanceCore(tx, {
              agencyId: ctx.agencyId,
              campaignId: c.id,
            })
            return {
              ...perf,
              name: c.name,
              channel: c.channel,
              status: c.status ?? "draft",
            } satisfies CampaignPerformanceRow
          }),
        )
      },
    )
    return { ok: true, rows }
  } catch (err) {
    console.error("[listCampaignPerformance]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
