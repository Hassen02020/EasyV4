"use server"

/**
 * CRM-CAMPAIGN-SAFETY-01 — confirmation de désinscription depuis la page
 * publique /desabonnement/[id]. Voir lib/crm/campaign-unsubscribe-core.ts.
 */

import { withSystemContext } from "@/lib/db/tenant-context"
import {
  unsubscribeCampaignTargetCore,
  type UnsubscribeResult,
} from "@/lib/crm/campaign-unsubscribe-core"

export async function unsubscribeCampaign(
  targetId: string,
): Promise<UnsubscribeResult | { ok: false; code: "UNAVAILABLE" }> {
  if (!process.env.DATABASE_URL) return { ok: false, code: "UNAVAILABLE" }
  try {
    return await withSystemContext((tx) =>
      unsubscribeCampaignTargetCore(tx, targetId),
    )
  } catch (err) {
    console.error("[unsubscribeCampaign] échec", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, code: "UNAVAILABLE" }
  }
}
