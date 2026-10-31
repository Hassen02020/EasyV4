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
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { verifyWhatsAppSignature } from "@/lib/whatsapp/signing"
import { type MetaMessagingPayload } from "@/lib/crm/meta-messaging"
import { processMessagingEvents } from "@/lib/meta/page-webhook-core"

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

  let payload: MetaMessagingPayload
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

  // Code partagé avec /meta-page (CRM-META-CONNECT-01) : échos ignorés,
  // horodatage Meta en millisecondes, identifiant externe, notification à
  // la création seulement.
  const processed = await processMessagingEvents(agencyId, "instagram", payload)

  return NextResponse.json({ ok: true, processed })
}
