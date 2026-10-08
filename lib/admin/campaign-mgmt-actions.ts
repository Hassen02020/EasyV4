"use server"

/**
 * CAMPAIGN-MGMT-01 — gestion admin des campagnes CRM : annulation et
 * visualisation des cibles. Consomme cancelCampaignCore et
 * listCampaignTargetsCore (lib/crm/campaign-persistence-core.ts).
 *
 * Même patron que campaign-performance-actions.ts :
 * assertSupportStaff() → withTenantContext → core function.
 * agencyId toujours résolu serveur (jamais fourni par l'appelant).
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  cancelCampaignCore,
  listCampaignTargetsCore,
  type CampaignTargetRow,
} from "@/lib/crm/campaign-persistence-core"

/* -------------------------------------------------------------------------- */
/* Auth guard (dupliqué localement — même rôles que campaign-performance)      */
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

export type { CampaignTargetRow }

export type CancelCampaignActionResult =
  | { ok: true }
  | { ok: false; error: string }

export type GetCampaignTargetsResult =
  | { ok: true; targets: CampaignTargetRow[] }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Public Server Actions                                                       */
/* -------------------------------------------------------------------------- */

export async function cancelCampaign(
  campaignId: string,
): Promise<CancelCampaignActionResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) => cancelCampaignCore(tx, { agencyId: ctx.agencyId, campaignId }),
    )
    if (!result.ok) {
      if (result.code === "CAMPAIGN_NOT_FOUND")
        return { ok: false, error: "Campagne introuvable." }
      if (result.code === "CAMPAIGN_ALREADY_TERMINAL")
        return { ok: false, error: "Cette campagne est déjà terminée ou annulée." }
    }
    return { ok: true }
  } catch (err) {
    console.error("[cancelCampaign]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export async function getCampaignTargets(
  campaignId: string,
): Promise<GetCampaignTargetsResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  try {
    const targets = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) => listCampaignTargetsCore(tx, { agencyId: ctx.agencyId, campaignId }),
    )
    return { ok: true, targets }
  } catch (err) {
    console.error("[getCampaignTargets]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
