"use server"

/**
 * CAMPAIGN-LIFECYCLE-01 — bridge PROPOSAL → CREATE → TARGET → LAUNCH.
 *
 * Seule action du chantier : `createAndLaunchCampaign` crée une campagne
 * depuis une CampaignProposal (name, objective, channel, message, leadIds),
 * puis la lance immédiatement dans la MÊME TRANSACTION ATOMIQUE.
 *
 * Séquence interne (CAMPAIGN-PERSISTENCE-01 + CAMPAIGN-01) :
 *   1. createCampaignCore  → status='draft'
 *   2. fetchLeadsByIdsCore → id/email/phone des leads de la proposition
 *   3. launchCampaignCore  → filterAudienceByConsentCore + snapshot
 *                             campaign_targets + status='active'
 *
 * Règle d'immutabilité (CAMPAIGN-EXTENSION-01) : le contenu est figé dès
 * le lancement — ce que l'utilisateur saisit ici EST ce qui sera envoyé,
 * jamais un éditeur post-lancement.
 *
 * PAS de `updateCampaignCore` dans ce flux : create + launch est atomique,
 * aucune fenêtre d'édition entre draft et active.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { createCampaignCore } from "@/lib/crm/campaign-persistence-core"
import { launchCampaignCore } from "@/lib/crm/campaign-persistence-core"
import { fetchLeadsByIdsCore } from "@/lib/crm/leads-core"
import { sendEvent } from "@/lib/inngest/client"
import type { CrmChannel } from "@/lib/db/schema"

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

export interface CreateAndLaunchParams {
  /** Nom de la campagne (pré-rempli depuis suggestedName, éditable). */
  name: string
  /** Objectif (pré-rempli depuis suggestedObjective, optionnel). */
  objective?: string | null
  /** Canal CRM résolu depuis la proposition (call/whatsapp/email). */
  crmChannel: CrmChannel
  /** Message template (pré-rempli depuis suggestedMessage, éditable). */
  message?: string | null
  /** IDs des leads ciblés par la proposition. */
  leadIds: string[]
}

export type CreateAndLaunchResult =
  | { ok: true; campaignId: string; targetCount: number }
  | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* Server action                                                               */
/* -------------------------------------------------------------------------- */

export async function createAndLaunchCampaign(
  params: CreateAndLaunchParams,
): Promise<CreateAndLaunchResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  if (!params.name?.trim())
    return { ok: false, error: "Le nom de la campagne est obligatoire" }
  if (params.leadIds.length === 0)
    return { ok: false, error: "Aucun lead ciblé" }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const campaign = await createCampaignCore(tx, {
          agencyId: ctx.agencyId,
          name: params.name.trim(),
          objective: params.objective ?? null,
          channel: params.crmChannel,
          message: params.message ?? null,
          createdByUserId: ctx.userId,
        })

        const audience = await fetchLeadsByIdsCore(tx, {
          agencyId: ctx.agencyId,
          ids: params.leadIds,
        })

        const launch = await launchCampaignCore(tx, {
          agencyId: ctx.agencyId,
          campaignId: campaign.id,
          audience,
        })

        if (!launch.ok) {
          throw new Error(launch.code)
        }

        return { campaignId: campaign.id, targetCount: launch.targetCount }
      },
    )

    // CAMPAIGN-DELIVERY-01 — déclencher la livraison en arrière-plan
    // (fire-and-forget : un échec Inngest ne doit jamais faire échouer le
    // retour du lancement — la campagne est déjà 'active' en DB).
    await sendEvent("crm/campaign.launched", {
      campaignId: result.campaignId,
      agencyId: ctx.agencyId,
      targetCount: result.targetCount,
    }).catch((err) => {
      console.error("[createAndLaunchCampaign] sendEvent failed", err)
    })

    return { ok: true, ...result }
  } catch (err) {
    console.error("[createAndLaunchCampaign]", err)
    const msg = err instanceof Error ? err.message : "Erreur technique"
    return { ok: false, error: msg }
  }
}
