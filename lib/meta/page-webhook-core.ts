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
        value?: { leadgen_id?: string; page_id?: string; form_id?: string }
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

/** Notification `leadgen` : identifiants techniques Meta (aucune donnée personnelle). */
export interface MetaLeadgenEvent {
  leadgenId: string
  pageId: string | null
  formId: string | null
}

export function extractLeadgenEvents(
  payload: MetaPagePayload,
): MetaLeadgenEvent[] {
  const out: MetaLeadgenEvent[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue
      const leadgenId = change.value?.leadgen_id
      if (!leadgenId) continue
      out.push({
        leadgenId,
        pageId: change.value?.page_id ?? entry.id ?? null,
        formId: change.value?.form_id ?? null,
      })
    }
  }
  return out
}

export function extractLeadgenIds(payload: MetaPagePayload): string[] {
  return extractLeadgenEvents(payload).map((e) => e.leadgenId)
}

/**
 * META-CRM-E2E-01 (P1-1) — identifiant fictif envoyé par le bouton
 * « Tester » du tableau de bord Webhooks de Meta. Ce prospect n'existera
 * jamais : répondre 500 ferait renvoyer Meta sans fin. Il est tracé à part
 * et accepté (200). Seul cet identifiant exact est concerné — un échec
 * Graph réel (jeton, autorisation, prospect introuvable) garde le 500.
 */
export const META_SAMPLE_LEADGEN_ID = "444444444444"

/** META-CRM-E2E-01 (P1-3) — Page Facebook attendue (facultative, non secrète). */
export function configuredMetaPageId(): string | null {
  const id = process.env.META_PAGE_ID?.trim()
  return id ? id : null
}

export const LEADADS_IGNORED_ACTION = "meta_leadads.ignored"

export type LeadgenIgnoredReason = "meta_sample" | "foreign_page"

export interface LeadgenIgnored {
  leadgenId: string
  reason: LeadgenIgnoredReason
}

/**
 * Sépare les notifications à traiter de celles à ignorer (P1-1 : envoi de
 * test Meta ; P1-3 : Page différente de META_PAGE_ID quand elle est
 * configurée). Fonction pure, testée seule.
 */
export function partitionLeadgenEvents(
  events: MetaLeadgenEvent[],
  expectedPageId: string | null,
): { accepted: MetaLeadgenEvent[]; ignored: LeadgenIgnored[] } {
  const accepted: MetaLeadgenEvent[] = []
  const ignored: LeadgenIgnored[] = []
  for (const event of events) {
    if (event.leadgenId === META_SAMPLE_LEADGEN_ID) {
      ignored.push({ leadgenId: event.leadgenId, reason: "meta_sample" })
    } else if (expectedPageId && event.pageId !== expectedPageId) {
      ignored.push({ leadgenId: event.leadgenId, reason: "foreign_page" })
    } else {
      accepted.push(event)
    }
  }
  return { accepted, ignored }
}

/**
 * Lead Ads — G-05 : tout échec (Meta, base) est tracé dans `audit_events`
 * (leadgen_id + code, et depuis META-CRM-E2E-01 le diagnostic Graph sans
 * message ni jeton) et doit faire répondre 500 à la route. Les
 * notifications ignorées (envoi de test, autre Page) sont tracées à part
 * et ne provoquent pas de 500.
 */
export async function processLeadgenEvents(
  agencyId: string,
  events: MetaLeadgenEvent[],
): Promise<{
  processed: number
  failures: LeadgenFailure[]
  ignored: LeadgenIgnored[]
}> {
  const { accepted, ignored } = partitionLeadgenEvents(
    events,
    configuredMetaPageId(),
  )
  const byId = new Map(events.map((e) => [e.leadgenId, e]))
  for (const item of ignored) {
    const event = byId.get(item.leadgenId)
    console.warn(
      "[Webhook/MetaLeadAds] Notification ignorée",
      item.leadgenId,
      item.reason,
    )
    await withSystemContext((tx) =>
      tx.insert(auditEvents).values({
        agencyId,
        entityType: "meta_leadgen",
        entityId: item.leadgenId,
        action: LEADADS_IGNORED_ACTION,
        diff: {
          reason: item.reason,
          pageId: event?.pageId ?? null,
          formId: event?.formId ?? null,
        },
      }),
    ).catch((err) => {
      console.error("[Webhook/MetaLeadAds] Trace « ignorée » impossible", err)
    })
  }

  const result = await processLeadgenBatchCore(
    accepted.map((e) => e.leadgenId),
    {
      fetchLead: fetchMetaLeadFieldDataCore,
      capture: (lead) => {
        const event = byId.get(lead.leadgenId)
        return withTenantContext(
          { agencyId, userId: "", isSuperAdmin: true },
          (tx) =>
            captureMetaLeadCore(tx, {
              agencyId,
              data: lead,
              origin: event
                ? { pageId: event.pageId, formId: event.formId }
                : undefined,
            }),
        )
      },
      notifyCreated: (leadId) =>
        notifyLeadCreated({ agencyId, leadId, channel: "meta_lead_ads" }),
      recordFailure: (failure) =>
        withSystemContext((tx) =>
          tx.insert(auditEvents).values({
            agencyId,
            entityType: "meta_leadgen",
            entityId: failure.leadgenId,
            action: LEADADS_FAILURE_ACTION,
            diff: failure.graph
              ? { code: failure.code, graph: failure.graph }
              : { code: failure.code },
          }),
        ).then(() => undefined),
    },
  )
  return { ...result, ignored }
}

/** Compatibilité : identifiants seuls (sans Page ni formulaire connus). */
export async function processLeadgenIds(
  agencyId: string,
  leadgenIds: string[],
) {
  return processLeadgenEvents(
    agencyId,
    leadgenIds.map((leadgenId) => ({ leadgenId, pageId: null, formId: null })),
  )
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
  // META-CRM-E2E-01 (P1-3) — Messenger : seuls les envois de la Page
  // attendue (entry.id) sont traités quand META_PAGE_ID est configurée.
  // Instagram : entry.id est le compte Instagram, jamais filtré ici.
  const expectedPageId = channel === "messenger" ? configuredMetaPageId() : null
  const scoped: MetaMessagingPayload = expectedPageId
    ? {
        ...payload,
        entry: payload.entry?.filter((e) => {
          const keep = e.id === expectedPageId
          if (!keep)
            console.warn("[Webhook/messenger] Envoi d'une autre Page ignoré")
          return keep
        }),
      }
    : payload
  for (const { senderId, mid, text, sentAt } of extractMetaInboundMessages(
    scoped,
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
