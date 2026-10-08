"use server"

/**
 * SEARCH-DEMAND-DISPLAY-01 — exposition staff des tendances de demande
 * hôtel issues de search_demand_signals (BEHAVIORAL-SIGNAL-01, PR #146).
 * Même patron que lib/admin/niche-actions.ts.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  getSearchDemandSummaryCore,
  type SearchDemandRow,
} from "@/lib/crm/search-demand-core"

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

export type ListSearchDemandResult =
  | { ok: true; rows: SearchDemandRow[] }
  | { ok: false; error: string }

export async function listSearchDemandSignals(): Promise<ListSearchDemandResult> {
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
      (tx) => getSearchDemandSummaryCore(tx, { agencyId: ctx.agencyId }),
    )
    return { ok: true, rows }
  } catch (err) {
    console.error("[listSearchDemandSignals]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
