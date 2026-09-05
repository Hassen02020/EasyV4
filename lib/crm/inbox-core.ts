/**
 * CRM / Inbox omnicanal — moteur central, même discipline que
 * lib/crm/leads-core.ts : pas un fichier `"use server"`, chaque fonction
 * reçoit `agencyId` déjà résolu par l'appelant, testable directement
 * contre une vraie transaction DB.
 *
 * Portée : le modèle est agnostique du canal (voir CRM_CHANNELS,
 * lib/db/schema.ts), mais seul WhatsApp a un provider réel branché ici —
 * `upsertConversationForInboundCore` est appelée par
 * app/api/webhooks/whatsapp/route.ts, le seul appelant actuel.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { crmConversations, crmMessages, leads } from "@/lib/db/schema"
import { CRM_CHANNELS, type CrmChannel } from "@/lib/db/schema"
import { createLeadCore } from "./leads-core"

export { CRM_CHANNELS }
export type { CrmChannel }

export const CONVERSATION_STATUSES = ["open", "closed"] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number]

export interface ConversationRow {
  id: string
  channel: CrmChannel
  contactPhone: string | null
  contactExternalId: string | null
  contactName: string | null
  leadId: string | null
  status: ConversationStatus
  lastMessageAt: Date | null
  lastInboundAt: Date | null
  lastMessagePreview: string | null
  createdAt: Date
  updatedAt: Date
}

export interface MessageRow {
  id: string
  direction: MessageDirection
  body: string | null
  handledByUserId: string | null
  externalMessageId: string | null
  createdAt: Date
}

function toConversationRow(r: typeof crmConversations.$inferSelect): ConversationRow {
  return {
    ...r,
    channel: r.channel as CrmChannel,
    status: r.status as ConversationStatus,
  }
}

function toMessageRow(r: typeof crmMessages.$inferSelect): MessageRow {
  return { ...r, direction: r.direction as MessageDirection }
}

/**
 * Les 100 conversations les plus récentes de l'agence — même limite de
 * volume que listLeadsCore (pas de pagination cursor, à revoir si le
 * volume réel le justifie).
 */
export async function listConversationsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; channel?: CrmChannel; status?: ConversationStatus },
): Promise<ConversationRow[]> {
  const clauses = [eq(crmConversations.agencyId, params.agencyId)]
  if (params.channel) clauses.push(eq(crmConversations.channel, params.channel))
  if (params.status) clauses.push(eq(crmConversations.status, params.status))

  const rows = await tx
    .select()
    .from(crmConversations)
    .where(and(...clauses))
    .orderBy(desc(crmConversations.lastMessageAt))
    .limit(100)

  return rows.map(toConversationRow)
}

export async function getConversationWithMessagesCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; conversationId: string },
): Promise<{ conversation: ConversationRow; messages: MessageRow[] } | null> {
  const [conversation] = await tx
    .select()
    .from(crmConversations)
    .where(
      and(
        eq(crmConversations.id, params.conversationId),
        eq(crmConversations.agencyId, params.agencyId),
      ),
    )
    .limit(1)
  if (!conversation) return null

  const messages = await tx
    .select()
    .from(crmMessages)
    .where(
      and(eq(crmMessages.conversationId, params.conversationId), eq(crmMessages.agencyId, params.agencyId)),
    )
    .orderBy(asc(crmMessages.createdAt))

  return { conversation: toConversationRow(conversation), messages: messages.map(toMessageRow) }
}

const MESSAGE_PREVIEW_LENGTH = 200

/**
 * Point d'entrée du webhook entrant : upsert la conversation (une par
 * agence+canal+contact, voir crm_conversations_agency_channel_phone_uniq),
 * insère le message (idempotent sur `externalMessageId` — un webhook Meta
 * redélivré ne crée jamais un doublon), puis lie automatiquement le
 * contact à un lead existant (même téléphone) ou en crée un nouveau —
 * même sémantique qu'un formulaire "Être rappelé" (app/actions/submit-lead.ts) :
 * un message entrant EST une demande de contact, jamais un lien automatique
 * vers une réservation (ça, `convertLeadCore` seul le fait, sur choix
 * explicite du staff).
 */
export async function upsertConversationForInboundCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    channel: CrmChannel
    contactPhone: string
    contactName?: string | null
    body: string
    externalMessageId: string
    sentAt: Date
  },
): Promise<{ conversationId: string; messageInserted: boolean }> {
  const [existing] = await tx
    .select({ id: crmConversations.id, leadId: crmConversations.leadId })
    .from(crmConversations)
    .where(
      and(
        eq(crmConversations.agencyId, params.agencyId),
        eq(crmConversations.channel, params.channel),
        eq(crmConversations.contactPhone, params.contactPhone),
      ),
    )
    .limit(1)

  let conversationId: string
  let leadId: string | null

  if (existing) {
    conversationId = existing.id
    leadId = existing.leadId
    await tx
      .update(crmConversations)
      .set({
        contactName: params.contactName ?? undefined,
        lastMessageAt: params.sentAt,
        lastInboundAt: params.sentAt,
        lastMessagePreview: params.body.slice(0, MESSAGE_PREVIEW_LENGTH),
        updatedAt: new Date(),
      })
      .where(eq(crmConversations.id, conversationId))
  } else {
    // Lie à un lead déjà existant portant ce téléphone (créé via un autre
    // canal — formulaire web, etc.) plutôt que d'en fabriquer un doublon.
    const [matchingLead] = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.agencyId, params.agencyId), eq(leads.phone, params.contactPhone)))
      .orderBy(desc(leads.createdAt))
      .limit(1)

    if (matchingLead) {
      leadId = matchingLead.id
    } else {
      const created = await createLeadCore(tx, {
        agencyId: params.agencyId,
        firstName: params.contactName?.trim() || "Contact WhatsApp",
        phone: params.contactPhone,
        message: params.body,
        productType: "general",
        sourcePage: params.channel,
      })
      leadId = created.id
    }

    const [inserted] = await tx
      .insert(crmConversations)
      .values({
        agencyId: params.agencyId,
        channel: params.channel,
        contactPhone: params.contactPhone,
        contactName: params.contactName ?? undefined,
        leadId,
        lastMessageAt: params.sentAt,
        lastInboundAt: params.sentAt,
        lastMessagePreview: params.body.slice(0, MESSAGE_PREVIEW_LENGTH),
      })
      .returning({ id: crmConversations.id })
    conversationId = inserted!.id
  }

  const insertedMessage = await tx
    .insert(crmMessages)
    .values({
      agencyId: params.agencyId,
      conversationId,
      direction: "inbound",
      body: params.body,
      externalMessageId: params.externalMessageId,
      createdAt: params.sentAt,
    })
    // La contrainte est un index unique PARTIEL (WHERE external_message_id
    // IS NOT NULL, voir 0046) — Postgres exige le même prédicat ici pour
    // inférer l'arbitre, sinon "no unique or exclusion constraint matching".
    .onConflictDoNothing({
      target: crmMessages.externalMessageId,
      where: sql`${crmMessages.externalMessageId} is not null`,
    })
    .returning({ id: crmMessages.id })

  return { conversationId, messageInserted: insertedMessage.length > 0 }
}

/**
 * Réponse sortante — appelée par l'action admin après un envoi réussi via
 * getWhatsAppProvider() (jamais avant : pas de message "envoyé" fabriqué
 * si le provider a échoué). Ne touche jamais `lastInboundAt` : seule la
 * fenêtre de service 24h calculée depuis le DERNIER message client compte
 * (voir canSendSessionMessage ci-dessous).
 */
export async function appendOutboundMessageCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    conversationId: string
    body: string
    handledByUserId: string
    externalMessageId?: string | null
  },
): Promise<{ id: string }> {
  const now = new Date()
  const [inserted] = await tx
    .insert(crmMessages)
    .values({
      agencyId: params.agencyId,
      conversationId: params.conversationId,
      direction: "outbound",
      body: params.body,
      handledByUserId: params.handledByUserId,
      externalMessageId: params.externalMessageId ?? undefined,
      createdAt: now,
    })
    .returning({ id: crmMessages.id })

  await tx
    .update(crmConversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: params.body.slice(0, MESSAGE_PREVIEW_LENGTH),
      updatedAt: now,
    })
    .where(and(eq(crmConversations.id, params.conversationId), eq(crmConversations.agencyId, params.agencyId)))

  return { id: inserted!.id }
}

const WHATSAPP_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Règle réelle de la plateforme WhatsApp Business Cloud API (documentée
 * dans lib/whatsapp/provider.ts) : un message libre (hors template
 * pré-approuvé) n'est autorisé que dans les 24h suivant le DERNIER message
 * du client. Fonction pure, jamais d'accès DB — testable directement.
 */
export function canSendSessionMessage(
  conversation: Pick<ConversationRow, "lastInboundAt">,
  now: Date = new Date(),
): boolean {
  if (!conversation.lastInboundAt) return false
  return now.getTime() - conversation.lastInboundAt.getTime() < WHATSAPP_SESSION_WINDOW_MS
}

/** Conversations sans conversation ouverte pour un canal non branché — jamais fabriqué, juste absent. */
export function isChannelConnected(channel: CrmChannel): boolean {
  return channel === "whatsapp"
}
