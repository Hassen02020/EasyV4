/**
 * CRM-META-CONNECT-01 (lot A) — traitements partagés des webhooks Meta.
 *
 * Meta n'accepte qu'UNE URL de callback par objet et par application. Les
 * champs `leadgen` (Lead Ads) et `messages` (Messenger) appartiennent au
 * même objet « Page » : ils arrivent donc sur la même URL
 * (`/api/webhooks/meta-page`). Ce module porte les deux traitements, appelés
 * par la route Page unifiée ET par les routes historiques
 * (`/meta-leadads`, `/messenger`, `/instagram`, conservées) — un seul code,
 * aucune logique dupliquée.
 *
 * Garanties inchangées :
 *  - Lead Ads : échec tracé + 500 pour relivraison (G-05), idempotence
 *    leadgen_id (verrou + index 0147, G-17), notification à la création
 *    seulement (G-03) ;
 *  - Messenger / Instagram : identifiant externe, échos ignorés, horodatage
 *    en millisecondes (CRM-SOCIAL-CODE-FIX-01), idempotence `mid`,
 *    notification à la création seulement.
 */

import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { auditEvents } from "@/lib/db/schema"
import { fetchMetaLeadFieldDataCore } from "@/lib/meta-leadads/provider"
import { captureMetaLeadCore } from "@/lib/meta-leadads/lead-capture-core"
import {
  LEADADS_FAILURE_ACTION,
  processLeadgenBatchCore,
  type LeadgenFailure,
} from "@/lib/meta-leadads/webhook-batch"
import { upsertConversationForInboundCore } from "@/lib/crm/inbox-core"
import { notifyLeadCreated } from "@/lib/crm/lead-created-notify"
import {
  extractMetaInboundMessages,
  type MetaMessagingPayload,
} from "@/lib/crm/meta-messaging"

/** Payload Meta de l'objet Page : `changes` (leadgen) et/ou `messaging`. */
export interface MetaPagePayload extends MetaMessagingPayload {
  entry?: Array<
    NonNullable<MetaMessagingPayload["entry"]>[number] & {
      changes?: Array<{
        field?: string
        value?: { leadgen_id?: string }
      }>
    }
  >
}

/** Handshake GET Meta : renvoie le challenge à écho, ou null si refusé. */
export function verifyMetaHandshake(
  params: URLSearchParams,
  verifyToken: string,
): string | null {
  const challenge = params.get("hub.challenge")
  return params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken &&
    challenge
    ? challenge
    : null
}

export function extractLeadgenIds(payload: MetaPagePayload): string[] {
  return (
    payload.entry
      ?.flatMap((e) => e.changes ?? [])
      .filter((c) => c.field === "leadgen")
      .map((c) => c.value?.leadgen_id)
      .filter((id): id is string => Boolean(id)) ?? []
  )
}

/**
 * Lead Ads — G-05 : tout échec (Meta, base) est tracé dans `audit_events`
 * (leadgen_id + code seulement) et doit faire répondre 500 à la route.
 */
export async function processLeadgenIds(
  agencyId: string,
  leadgenIds: string[],
): Promise<{ processed: number; failures: LeadgenFailure[] }> {
  return processLeadgenBatchCore(leadgenIds, {
    fetchLead: fetchMetaLeadFieldDataCore,
    capture: (lead) =>
      withTenantContext({ agencyId, userId: "", isSuperAdmin: true }, (tx) =>
        captureMetaLeadCore(tx, { agencyId, data: lead }),
      ),
    notifyCreated: (leadId) =>
      notifyLeadCreated({ agencyId, leadId, channel: "meta_lead_ads" }),
    recordFailure: (failure) =>
      withSystemContext((tx) =>
        tx.insert(auditEvents).values({
          agencyId,
          entityType: "meta_leadgen",
          entityId: failure.leadgenId,
          action: LEADADS_FAILURE_ACTION,
          diff: { code: failure.code },
        }),
      ).then(() => undefined),
  })
}

/**
 * Messenger / Instagram — un message en erreur est journalisé sans bloquer
 * les autres (Meta relivre agressivement ; l'idempotence `mid` protège).
 */
export async function processMessagingEvents(
  agencyId: string,
  channel: "messenger" | "instagram",
  payload: MetaMessagingPayload,
): Promise<number> {
  let processed = 0
  for (const { senderId, mid, text, sentAt } of extractMetaInboundMessages(
    payload,
  )) {
    try {
      const inbound = await withTenantContext(
        { agencyId, userId: "", isSuperAdmin: true },
        (tx) =>
          upsertConversationForInboundCore(tx, {
            agencyId,
            channel,
            contactExternalId: senderId,
            body: text,
            externalMessageId: mid,
            sentAt,
          }),
      )
      processed++
      // G-03 — email « nouveau lead » seulement si ce message a créé le lead.
      if (inbound.createdLeadId) {
        await notifyLeadCreated({
          agencyId,
          leadId: inbound.createdLeadId,
          channel,
        })
      }
    } catch (err) {
      console.error(`[Webhook/${channel}] Échec traitement message`, mid, err)
    }
  }
  return processed
}
