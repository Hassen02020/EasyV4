"use server"

/**
 * CRM / Inbox omnicanal — actions staff (`/admin/support`). Même garde que
 * lib/admin/leads-actions.ts (SUPPORT_STAFF_ROLES), même discipline
 * "use server" / core séparé.
 *
 * CRM-OUTBOUND-META-01 : réponses sortantes Messenger / Instagram via
 * Meta Graph API POST /me/messages. Requiert META_PAGE_ACCESS_TOKEN (Page
 * Access Token longue durée). Guard explicite : si absent → canReply=false
 * dans getConversationThread et erreur explicite dans sendReply.
 * CRM-SOCIAL-CODE-FIX-01 : pour ces canaux, le PSID / IGSID est stocké dans
 * `contactExternalId` (jamais dans contactPhone) — c'est le recipient.id de
 * l'API Send.
 */

import { revalidatePath } from "next/cache"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  listConversationsCore,
  getConversationWithMessagesCore,
  appendOutboundMessageCore,
  canSendSessionMessage,
  isExternalIdChannel,
  type ConversationRow,
  type MessageRow,
} from "@/lib/crm/inbox-core"
import { getLeadScoreRuleMapCore } from "@/lib/crm/lead-scoring-core"
import {
  getCustomer360Core,
  type Customer360,
} from "@/lib/admin/customer-360-core"
import { getWhatsAppProvider } from "@/lib/whatsapp/provider"
import { metaGraphUrl } from "@/lib/meta/graph"

const SUPPORT_STAFF_ROLES = ["super_admin", "manager", "agent_resa"] as const

const META_OUTBOUND_CHANNELS = ["messenger", "instagram"] as const

/**
 * Renvoie true si le canal supporte les réponses sortantes staff dans
 * l'environnement courant. Distinct de isChannelConnected (inbound) :
 * messenger/instagram peuvent recevoir des messages sans que
 * META_PAGE_ACCESS_TOKEN soit configuré (outbound).
 */
function canSendOutbound(channel: string): boolean {
  if (channel === "whatsapp") return true
  if ((META_OUTBOUND_CHANNELS as readonly string[]).includes(channel)) {
    return !!process.env.META_PAGE_ACCESS_TOKEN
  }
  return false
}

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

export type ListConversationsResult =
  | { ok: true; conversations: ConversationRow[] }
  | { ok: false; error: string }

export async function listConversations(): Promise<ListConversationsResult> {
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
      (tx) => listConversationsCore(tx, { agencyId: ctx.agencyId }),
    )
    return { ok: true, conversations: rows }
  } catch (err) {
    console.error("[listConversations]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type GetConversationThreadResult =
  | {
      ok: true
      conversation: ConversationRow
      messages: MessageRow[]
      canReply: boolean
    }
  | { ok: false; error: string }

export async function getConversationThread(
  conversationId: string,
): Promise<GetConversationThreadResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }
  if (!conversationId) return { ok: false, error: "Identifiant invalide." }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) =>
        getConversationWithMessagesCore(tx, {
          agencyId: ctx.agencyId,
          conversationId,
        }),
    )
    if (!result) return { ok: false, error: "Conversation introuvable." }
    const canReply =
      canSendSessionMessage(result.conversation) &&
      canSendOutbound(result.conversation.channel)
    return {
      ok: true,
      conversation: result.conversation,
      messages: result.messages,
      canReply,
    }
  } catch (err) {
    console.error("[getConversationThread]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type SendReplyResult = { ok: true } | { ok: false; error: string }

/**
 * Réponse libre (hors template) — WhatsApp, Messenger et Instagram dans la
 * fenêtre de service 24h Meta (voir canSendSessionMessage).
 *
 * Messenger / Instagram : POST /me/messages via Meta Graph API (version :
 * lib/meta/graph.ts, META_GRAPH_API_VERSION, v21.0 par défaut),
 * messaging_type:"RESPONSE", recipient.id = PSID / IGSID (contactExternalId).
 * Requiert META_PAGE_ACCESS_TOKEN ; guard explicite → erreur si absent.
 *
 * Le message n'est journalisé QU'APRÈS confirmation réelle du provider —
 * jamais un "envoyé" fabriqué si l'appel échoue (même discipline que
 * sendBookingConfirmationWhatsApp).
 */
export async function sendReply(input: {
  conversationId: string
  body: string
}): Promise<SendReplyResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }
  const body = input.body.trim()
  if (!body) return { ok: false, error: "Message vide." }
  if (!input.conversationId)
    return { ok: false, error: "Identifiant invalide." }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) =>
        getConversationWithMessagesCore(tx, {
          agencyId: ctx.agencyId,
          conversationId: input.conversationId,
        }),
    )
    if (!result) return { ok: false, error: "Conversation introuvable." }
    const { conversation } = result

    if (!canSendOutbound(conversation.channel)) {
      return {
        ok: false,
        error: (META_OUTBOUND_CHANNELS as readonly string[]).includes(
          conversation.channel,
        )
          ? "Réponses Meta non configurées (PAGE_ACCESS_TOKEN absent)."
          : "Ce canal ne supporte pas les réponses sortantes.",
      }
    }

    if (!canSendSessionMessage(conversation)) {
      return {
        ok: false,
        error:
          "Fenêtre de service de 24h dépassée depuis le dernier message du client — une réponse libre n'est plus autorisée par Meta.",
      }
    }

    const recipientId = isExternalIdChannel(conversation.channel)
      ? conversation.contactExternalId
      : conversation.contactPhone
    if (!recipientId)
      return { ok: false, error: "Identifiant de contact manquant." }

    if (conversation.channel === "whatsapp") {
      const provider = getWhatsAppProvider()
      const sendResult = await provider.sendSessionMessage({
        to: recipientId,
        body,
      })
      if (!sendResult.ok) {
        return {
          ok: false,
          error: sendResult.message ?? "Échec de l'envoi WhatsApp.",
        }
      }

      await withTenantContext(
        { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
        (tx) =>
          appendOutboundMessageCore(tx, {
            agencyId: ctx.agencyId,
            conversationId: input.conversationId,
            body,
            handledByUserId: ctx.userId,
            externalMessageId: sendResult.providerMessageId ?? null,
          }),
      )
      revalidatePath("/admin/support")
      return { ok: true }
    }

    if (
      (META_OUTBOUND_CHANNELS as readonly string[]).includes(
        conversation.channel,
      )
    ) {
      const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN!
      const metaRes = await fetch(metaGraphUrl("me/messages"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pageAccessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: { text: body },
        }),
      })
      if (!metaRes.ok) {
        const errData = await metaRes.json().catch(() => ({}))
        console.error(
          `[sendReply/${conversation.channel}] Échec Meta Send API`,
          errData,
        )
        return { ok: false, error: "Échec de l'envoi via Meta." }
      }

      await withTenantContext(
        { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
        (tx) =>
          appendOutboundMessageCore(tx, {
            agencyId: ctx.agencyId,
            conversationId: input.conversationId,
            body,
            handledByUserId: ctx.userId,
            externalMessageId: null,
          }),
      )
      revalidatePath("/admin/support")
      return { ok: true }
    }

    return { ok: false, error: "Canal non pris en charge." }
  } catch (err) {
    console.error("[sendReply]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type GetCustomer360Result =
  | { ok: true; customer360: Customer360 }
  | { ok: false; error: string }

export async function getCustomer360(
  leadId: string,
): Promise<GetCustomer360Result> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }
  if (!leadId) return { ok: false, error: "Identifiant invalide." }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const scoreRules = await getLeadScoreRuleMapCore(tx, {
          agencyId: ctx.agencyId,
        })
        return getCustomer360Core(tx, {
          agencyId: ctx.agencyId,
          leadId,
          scoreRules,
        })
      },
    )
    if (!result) return { ok: false, error: "Demande introuvable." }
    return { ok: true, customer360: result }
  } catch (err) {
    console.error("[getCustomer360]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
