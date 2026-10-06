"use server"

/**
 * CRM / Niche — exposition staff de la segmentation NICHE-01/NICHE-
 * PROVENANCE-01. Jusqu'ici `getNicheSegmentsCore()` n'avait AUCUN
 * consommateur (gap identifié par audit : le moteur calculait, rien ne le
 * lisait). Même patron que lib/admin/leads-actions.ts.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getNicheSegmentsCore, type NicheSegment } from "@/lib/crm/niche-core"

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

export type ListNicheSegmentsResult =
  | { ok: true; segments: NicheSegment[] }
  | { ok: false; error: string }

export async function listNicheSegments(): Promise<ListNicheSegmentsResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  try {
    const segments = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) => getNicheSegmentsCore(tx, { agencyId: ctx.agencyId }),
    )
    return { ok: true, segments }
  } catch (err) {
    console.error("[listNicheSegments]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
