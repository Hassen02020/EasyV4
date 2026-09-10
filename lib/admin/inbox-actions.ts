"use server"

/**
 * CRM / Inbox omnicanal — actions staff (`/admin/support`). Même garde que
 * lib/admin/leads-actions.ts (SUPPORT_STAFF_ROLES), même discipline
 * "use server" / core séparé.
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
  isChannelConnected,
  type ConversationRow,
  type MessageRow,
} from "@/lib/crm/inbox-core"
import { getLeadScoreRuleMapCore } from "@/lib/crm/lead-scoring-core"
import { getCustomer360Core, type Customer360 } from "@/lib/admin/customer-360-core"
import { getWhatsAppProvider } from "@/lib/whatsapp/provider"

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
  if (!(SUPPORT_STAFF_ROLES as readonly string[]).includes(profile.role ?? "")) {
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
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  try {
    const rows = await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
      listConversationsCore(tx, { agencyId: ctx.agencyId }),
    )
    return { ok: true, conversations: rows }
  } catch (err) {
    console.error("[listConversations]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type GetConversationThreadResult =
  | { ok: true; conversation: ConversationRow; messages: MessageRow[]; canReply: boolean }
  | { ok: false; error: string }

export async function getConversationThread(conversationId: string): Promise<GetConversationThreadResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }
  if (!conversationId) return { ok: false, error: "Identifiant invalide." }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) => getConversationWithMessagesCore(tx, { agencyId: ctx.agencyId, conversationId }),
    )
    if (!result) return { ok: false, error: "Conversation introuvable." }
    const canReply = isChannelConnected(result.conversation.channel) && canSendSessionMessage(result.conversation)
    return { ok: true, conversation: result.conversation, messages: result.messages, canReply }
  } catch (err) {
    console.error("[getConversationThread]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type SendReplyResult = { ok: true } | { ok: false; error: string }

/**
 * Réponse libre (hors template) — n'existe que pour WhatsApp aujourd'hui
 * (seul canal réellement branché) ET seulement dans la fenêtre de service
 * 24h Meta (voir canSendSessionMessage). Le message n'est journalisé
 * QU'APRÈS confirmation réelle du provider — jamais un "envoyé" fabriqué
 * si l'appel échoue (même discipline que sendBookingConfirmationWhatsApp).
 */
export async function sendReply(input: { conversationId: string; body: string }): Promise<SendReplyResult> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }
  const body = input.body.trim()
  if (!body) return { ok: false, error: "Message vide." }
  if (!input.conversationId) return { ok: false, error: "Identifiant invalide." }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      (tx) => getConversationWithMessagesCore(tx, { agencyId: ctx.agencyId, conversationId: input.conversationId }),
    )
    if (!result) return { ok: false, error: "Conversation introuvable." }
    const { conversation } = result

    if (!isChannelConnected(conversation.channel)) {
      return { ok: false, error: "Ce canal n'est pas connecté." }
    }
    if (conversation.channel === "whatsapp") {
      if (!canSendSessionMessage(conversation)) {
        return {
          ok: false,
          error:
            "Fenêtre de service WhatsApp de 24h dépassée depuis le dernier message du client — un message libre n'est plus autorisé par Meta.",
        }
      }
      if (!conversation.contactPhone) return { ok: false, error: "Numéro de contact manquant." }

      const provider = getWhatsAppProvider()
      const sendResult = await provider.sendSessionMessage({ to: conversation.contactPhone, body })
      if (!sendResult.ok) {
        return { ok: false, error: sendResult.message ?? "Échec de l'envoi WhatsApp." }
      }

      await withTenantContext({ agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false }, (tx) =>
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

    return { ok: false, error: "Canal non pris en charge." }
  } catch (err) {
    console.error("[sendReply]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}

export type GetCustomer360Result = { ok: true; customer360: Customer360 } | { ok: false; error: string }

export async function getCustomer360(leadId: string): Promise<GetCustomer360Result> {
  let ctx: SupportStaffContext
  try {
    ctx = await assertSupportStaff()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "FORBIDDEN" }
  }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }
  if (!leadId) return { ok: false, error: "Identifiant invalide." }

  try {
    const result = await withTenantContext(
      { agencyId: ctx.agencyId, userId: ctx.userId, isSuperAdmin: false },
      async (tx) => {
        const scoreRules = await getLeadScoreRuleMapCore(tx, { agencyId: ctx.agencyId })
        return getCustomer360Core(tx, { agencyId: ctx.agencyId, leadId, scoreRules })
      },
    )
    if (!result) return { ok: false, error: "Demande introuvable." }
    return { ok: true, customer360: result }
  } catch (err) {
    console.error("[getCustomer360]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
