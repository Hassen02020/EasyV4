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
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { verifyWhatsAppSignature } from "@/lib/whatsapp/signing"
import { type MetaMessagingPayload } from "@/lib/crm/meta-messaging"
import { processMessagingEvents } from "@/lib/meta/page-webhook-core"

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

  let payload: MetaMessagingPayload
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

  // Code partagé avec /meta-page (CRM-META-CONNECT-01) : échos ignorés,
  // horodatage Meta en millisecondes, identifiant externe, notification à
  // la création seulement.
  const processed = await processMessagingEvents(agencyId, "messenger", payload)

  return NextResponse.json({ ok: true, processed })
}
