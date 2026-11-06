/**
 * Webhook entrant WhatsApp Business Cloud API (Meta).
 *
 * GET  — handshake de vérification Meta (`hub.mode`/`hub.verify_token`/
 *        `hub.challenge`), requis une seule fois à la configuration du
 *        webhook dans le Meta Business Manager.
 * POST — messages entrants réels. Sécurité, même discipline que
 *        app/api/payment/webhook/route.ts :
 *         1. Signature HMAC-SHA256 vérifiée AVANT toute logique
 *            (lib/whatsapp/signing.ts, WHATSAPP_APP_SECRET).
 *         2. Idempotence : chaque `wamid` Meta n'est jamais retraité deux
 *            fois (contrainte unique crm_messages.external_message_id,
 *            voir upsertConversationForInboundCore).
 *         3. Toute requête sans credentials configurés échoue explicitement
 *            (503) — jamais un faux succès (même discipline que
 *            WHATSAPP_PROVIDER_NOT_CONFIGURED côté sortant).
 *
 * Un payload peut contenir des `statuses` (accusés de livraison/lecture)
 * au lieu de `messages` — ignoré silencieusement (200), ce n'est pas un
 * message entrant.
 *
 * WHATSAPP-CRM-01 : seul l'objet `whatsapp_business_account` est lu ; si
 * WHATSAPP_PHONE_NUMBER_ID est configuré, un autre numéro est ignoré et
 * tracé (W-03) ; boutons, réponses interactives et médias deviennent une
 * ligne visible dans la conversation (W-06, lib/whatsapp/inbound.ts).
 */

import { type NextRequest, NextResponse } from "next/server"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { auditEvents } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/provider"
import { verifyWhatsAppSignature } from "@/lib/whatsapp/signing"
import {
  extractWhatsAppInboundMessages,
  type WhatsAppWebhookPayload,
} from "@/lib/whatsapp/inbound"
import { upsertConversationForInboundCore } from "@/lib/crm/inbox-core"
import { notifyLeadCreated } from "@/lib/crm/lead-created-notify"

export async function GET(request: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (!verifyToken) {
    return NextResponse.json({ error: "Misconfigured" }, { status: 503 })
  }

  const params = request.nextUrl.searchParams
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token")
  const challenge = params.get("hub.challenge")

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    console.error("[Webhook/WhatsApp] WHATSAPP_APP_SECRET manquant")
    return NextResponse.json({ error: "Misconfigured" }, { status: 503 })
  }

  const rawBody = Buffer.from(await request.arrayBuffer())
  const signatureOk = verifyWhatsAppSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    appSecret,
  )
  if (!signatureOk) {
    console.warn("[Webhook/WhatsApp] Signature invalide — requête rejetée")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  let payload: WhatsAppWebhookPayload
  try {
    payload = JSON.parse(rawBody.toString("utf8"))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    console.error("[Webhook/WhatsApp] Aucune agence par défaut résolue")
    return NextResponse.json({ error: "No agency configured" }, { status: 503 })
  }

  // WHATSAPP-CRM-01 (W-03, W-06) — lecture partagée et testée seule.
  const expectedPhoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || null
  const { messages, ignored } = extractWhatsAppInboundMessages(
    payload,
    expectedPhoneNumberId,
  )
  for (const item of ignored) {
    if (item.reason !== "foreign_phone_number") continue
    console.warn("[Webhook/WhatsApp] Notification d'un autre numéro ignorée")
    await withSystemContext((tx) =>
      tx.insert(auditEvents).values({
        agencyId,
        entityType: "whatsapp_inbound",
        entityId: item.phoneNumberId ?? "inconnu",
        action: "whatsapp.inbound_ignored",
        diff: { reason: item.reason, phoneNumberId: item.phoneNumberId },
      }),
    ).catch((err) => {
      console.error("[Webhook/WhatsApp] Trace « ignorée » impossible", err)
    })
  }

  let processed = 0
  for (const message of messages) {
    const phone = normalizeWhatsAppPhone(message.from)
    if (!phone) continue

    const sentAt = message.timestamp
      ? new Date(Number(message.timestamp) * 1000)
      : new Date()

    try {
      const inbound = await withTenantContext(
        { agencyId, userId: "", isSuperAdmin: true },
        (tx) =>
          upsertConversationForInboundCore(tx, {
            agencyId,
            channel: "whatsapp",
            contactPhone: phone,
            contactName: message.contactName,
            body: message.body,
            externalMessageId: message.id,
            sentAt,
          }),
      )
      processed++
      // G-03 — email « nouveau lead » seulement si ce message a créé le lead.
      if (inbound.createdLeadId) {
        await notifyLeadCreated({
          agencyId,
          leadId: inbound.createdLeadId,
          channel: "whatsapp",
        })
      }
    } catch (err) {
      console.error(
        "[Webhook/WhatsApp] Échec traitement message",
        message.id,
        err,
      )
    }
  }

  // Toujours 200 dès que la signature est valide — Meta réessaie
  // agressivement un webhook en échec ; un message individuel en erreur
  // (déjà journalisé ci-dessus) ne doit jamais bloquer les autres.
  return NextResponse.json({ ok: true, processed, ignored: ignored.length })
}
