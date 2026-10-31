/**
 * CRM-LEADADS-NO-LOSS-01 (écart G-05) — traitement d'un lot de `leadgen_id`
 * reçus par le webhook Meta Lead Ads.
 *
 * Avant : un échec (jeton Meta absent, Graph API en erreur, erreur base)
 * était seulement journalisé et la route répondait 200 → Meta ne
 * renvoyait jamais la notification : prospect perdu, sans trace durable.
 *
 * Désormais : chaque échec est tracé dans `audit_events` (leadgen_id et code
 * d'erreur seulement — jamais de donnée du prospect ni de message brut, qui
 * pourrait contenir l'URL Graph et son jeton) et la route répond 500 pour
 * que Meta renvoie la notification. Les leads déjà enregistrés du même lot
 * sont ignorés au renvoi (idempotence sur leadgen_id, voir
 * lead-capture-core.ts) : ni doublon, ni second email.
 */

import type { MetaLeadAdsProviderCode, MetaLeadFetchResult } from "./provider"
import type { MetaLeadCaptureResult } from "./lead-capture-core"

export const LEADADS_FAILURE_ACTION = "meta_leadads.capture_failed"

export type LeadgenFailureCode =
  | MetaLeadAdsProviderCode
  | "META_LEADADS_CAPTURE_FAILED"

export interface LeadgenFailure {
  leadgenId: string
  code: LeadgenFailureCode
}

export interface LeadgenBatchDeps {
  fetchLead: (leadgenId: string) => Promise<MetaLeadFetchResult>
  capture: (
    lead: Extract<MetaLeadFetchResult, { ok: true }>["lead"],
  ) => Promise<MetaLeadCaptureResult>
  notifyCreated: (leadId: string) => Promise<void>
  recordFailure: (failure: LeadgenFailure) => Promise<void>
}

export async function processLeadgenBatchCore(
  leadgenIds: string[],
  deps: LeadgenBatchDeps,
): Promise<{ processed: number; failures: LeadgenFailure[] }> {
  let processed = 0
  const failures: LeadgenFailure[] = []

  for (const leadgenId of leadgenIds) {
    let failure: LeadgenFailure | null = null
    try {
      const fetched = await deps.fetchLead(leadgenId)
      if (!fetched.ok) {
        failure = { leadgenId, code: fetched.code }
      } else {
        const captured = await deps.capture(fetched.lead)
        processed++
        // G-03 — email « nouveau lead » seulement à la création (jamais sur
        // un leadgen_id déjà traité, que Meta relivre après un 500).
        if (!captured.alreadyProcessed) {
          await deps.notifyCreated(captured.leadId)
        }
      }
    } catch {
      failure = { leadgenId, code: "META_LEADADS_CAPTURE_FAILED" }
    }

    if (failure) {
      failures.push(failure)
      console.error(
        "[Webhook/MetaLeadAds] Échec lead",
        failure.leadgenId,
        failure.code,
      )
      // La trace ne doit jamais empêcher le traitement des autres leads.
      await deps.recordFailure(failure).catch((err) => {
        console.error("[Webhook/MetaLeadAds] Trace d'échec impossible", err)
      })
    }
  }

  return { processed, failures }
}
