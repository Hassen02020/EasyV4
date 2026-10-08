"use server"

/**
 * TIME-SERIES-01 — Server Action publique.
 *
 * Délègue à getTimeSeriesCore (lib/crm/time-series-core.ts) — pas de
 * calcul financier ici. Même patron auth/tenant que les autres actions
 * admin/analytics/*.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  getTimeSeriesCore,
  type TimeSeriesRow,
} from "@/lib/crm/time-series-core"

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

export type { TimeSeriesRow }

export type GetTimeSeriesResult =
  | { ok: true; rows: TimeSeriesRow[]; windowWeeks: number }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Public Server Action                                                        */
/* -------------------------------------------------------------------------- */

export async function getTimeSeries(
  windowWeeks: 4 | 8 | 12 = 4,
): Promise<GetTimeSeriesResult> {
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
      async (tx) => getTimeSeriesCore(tx, { agencyId: ctx.agencyId, windowWeeks }),
    )
    return { ok: true, rows, windowWeeks }
  } catch (err) {
    console.error("[getTimeSeries]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
