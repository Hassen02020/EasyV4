/**
 * CRM-E — webhook entrant Instagram DMs.
 *
 * GET  — handshake Meta (`hub.mode`/`hub.verify_token`/`hub.challenge`).
 *        Token dédié (META_INSTAGRAM_VERIFY_TOKEN).
 * POST — messages directs Instagram. Payload Meta `object:"instagram"`,
 *        même structure `.entry[*].messaging[*]` que Messenger.
 *        Même discipline de sécurité (HMAC META_APP_SECRET, 503 si absent,
 *        idempotence sur `message.mid`, toujours 200 dès que signature ok).
 */

import { type NextRequest, NextResponse } from "next/server"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { verifyWhatsAppSignature } from "@/lib/whatsapp/signing"
import { upsertConversationForInboundCore } from "@/lib/crm/inbox-core"
import { notifyLeadCreated } from "@/lib/crm/lead-created-notify"

interface InstagramWebhookPayload {
  object?: string
  entry?: Array<{
    id?: string
    messaging?: Array<{
      sender?: { id?: string }
      recipient?: { id?: string }
      timestamp?: number
      message?: { mid?: string; text?: string }
    }>
  }>
}

export async function GET(request: NextRequest) {
  const verifyToken = process.env.META_INSTAGRAM_VERIFY_TOKEN
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
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.error("[Webhook/Instagram] META_APP_SECRET manquant")
    return NextResponse.json({ error: "Misconfigured" }, { status: 503 })
  }

  const rawBody = Buffer.from(await request.arrayBuffer())
  const signatureOk = verifyWhatsAppSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    appSecret,
  )
  if (!signatureOk) {
    console.warn("[Webhook/Instagram] Signature invalide — requête rejetée")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  let payload: InstagramWebhookPayload
  try {
    payload = JSON.parse(rawBody.toString("utf8"))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (payload.object !== "instagram") {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    console.error("[Webhook/Instagram] Aucune agence par défaut résolue")
    return NextResponse.json({ error: "No agency configured" }, { status: 503 })
  }

  const messagingEvents = payload.entry?.flatMap((e) => e.messaging ?? []) ?? []

  let processed = 0
  for (const event of messagingEvents) {
    const senderId = event.sender?.id
    const mid = event.message?.mid
    const text = event.message?.text

    if (!senderId || !mid || !text) continue

    const sentAt = event.timestamp
      ? new Date(event.timestamp * 1000)
      : new Date()

    try {
      const inbound = await withTenantContext(
        { agencyId, userId: "", isSuperAdmin: true },
        (tx) =>
          upsertConversationForInboundCore(tx, {
            agencyId,
            channel: "instagram",
            contactPhone: senderId,
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
          channel: "instagram",
        })
      }
    } catch (err) {
      console.error("[Webhook/Instagram] Échec traitement message", mid, err)
    }
  }

  return NextResponse.json({ ok: true, processed })
}
