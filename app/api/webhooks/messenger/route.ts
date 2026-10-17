/**
 * CRM-E — webhook entrant Messenger (Page Facebook).
 *
 * GET  — handshake Meta (`hub.mode`/`hub.verify_token`/`hub.challenge`),
 *        même protocole que whatsapp/route.ts. Token dédié
 *        (META_MESSENGER_VERIFY_TOKEN) — jamais partagé avec les autres
 *        endpoints Meta pour limiter l'impact d'une fuite.
 * POST — messages entrants. Payload Meta `object:"page"`, chaque entrée
 *        porte un tableau `messaging` (pas `changes.value.messages` comme
 *        WhatsApp). Sécurité identique : HMAC-SHA256 vérifié AVANT toute
 *        logique (même META_APP_SECRET que meta-leadads).
 *
 * Discipline de sécurité :
 *  1. 503 si META_APP_SECRET ou META_MESSENGER_VERIFY_TOKEN absent.
 *  2. Signature HMAC vérifiée via verifyWhatsAppSignature (générique Meta).
 *  3. Idempotence sur `message.mid` — onConflictDoNothing dans
 *     upsertConversationForInboundCore (contrainte unique crm_messages.
 *     external_message_id).
 *  4. Toujours 200 dès que la signature est valide — Meta réessaie
 *     agressivement un webhook en échec.
 */

import { type NextRequest, NextResponse } from "next/server"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { verifyWhatsAppSignature } from "@/lib/whatsapp/signing"
import { upsertConversationForInboundCore } from "@/lib/crm/inbox-core"

interface MessengerWebhookPayload {
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
  const verifyToken = process.env.META_MESSENGER_VERIFY_TOKEN
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
    console.error("[Webhook/Messenger] META_APP_SECRET manquant")
    return NextResponse.json({ error: "Misconfigured" }, { status: 503 })
  }

  const rawBody = Buffer.from(await request.arrayBuffer())
  const signatureOk = verifyWhatsAppSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    appSecret,
  )
  if (!signatureOk) {
    console.warn("[Webhook/Messenger] Signature invalide — requête rejetée")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  let payload: MessengerWebhookPayload
  try {
    payload = JSON.parse(rawBody.toString("utf8"))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (payload.object !== "page") {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    console.error("[Webhook/Messenger] Aucune agence par défaut résolue")
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
      await withTenantContext(
        { agencyId, userId: "", isSuperAdmin: true },
        (tx) =>
          upsertConversationForInboundCore(tx, {
            agencyId,
            channel: "messenger",
            contactPhone: senderId,
            body: text,
            externalMessageId: mid,
            sentAt,
          }),
      )
      processed++
    } catch (err) {
      console.error("[Webhook/Messenger] Échec traitement message", mid, err)
    }
  }

  return NextResponse.json({ ok: true, processed })
}
