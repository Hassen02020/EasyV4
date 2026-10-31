/**
 * CRM-META-CONNECT-01 (lot A) — webhook UNIQUE de l'objet Meta « Page ».
 *
 * Meta n'accepte qu'une URL de callback par objet et par application : les
 * champs `leadgen` (Lead Ads) et `messages` (Messenger) de la Page Facebook
 * arrivent donc ici, dans le même envoi le cas échéant. C'est l'URL à
 * déclarer pour l'objet Page dans le tableau de bord de l'application Meta.
 * L'objet « Instagram » garde sa propre URL (`/api/webhooks/instagram`).
 * Les routes historiques `/meta-leadads` et `/messenger` restent en place et
 * partagent le même code (lib/meta/page-webhook-core.ts).
 *
 * GET  — handshake Meta, token dédié META_PAGE_VERIFY_TOKEN.
 * POST — 1. 503 si META_APP_SECRET absent (jamais un faux succès) ;
 *        2. signature HMAC-SHA256 (`x-hub-signature-256`) vérifiée AVANT
 *           toute logique → 400 sinon, rien n'est écrit ;
 *        3. messages Messenger traités (idempotence `mid`) ;
 *        4. leads `leadgen` traités : au moindre échec → 500 pour que Meta
 *           relivre (G-05) ; au renvoi, les messages et leads déjà
 *           enregistrés sont ignorés (idempotence), ni doublon ni second
 *           email.
 */

import { type NextRequest, NextResponse } from "next/server"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { verifyWhatsAppSignature } from "@/lib/whatsapp/signing"
import {
  extractLeadgenIds,
  processLeadgenIds,
  processMessagingEvents,
  verifyMetaHandshake,
  type MetaPagePayload,
} from "@/lib/meta/page-webhook-core"

export async function GET(request: NextRequest) {
  const verifyToken = process.env.META_PAGE_VERIFY_TOKEN
  if (!verifyToken) {
    return NextResponse.json({ error: "Misconfigured" }, { status: 503 })
  }
  const challenge = verifyMetaHandshake(
    request.nextUrl.searchParams,
    verifyToken,
  )
  return challenge
    ? new NextResponse(challenge, { status: 200 })
    : NextResponse.json({ error: "Verification failed" }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.error("[Webhook/MetaPage] META_APP_SECRET manquant")
    return NextResponse.json({ error: "Misconfigured" }, { status: 503 })
  }

  const rawBody = Buffer.from(await request.arrayBuffer())
  const signatureOk = verifyWhatsAppSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    appSecret,
  )
  if (!signatureOk) {
    console.warn("[Webhook/MetaPage] Signature invalide — requête rejetée")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  let payload: MetaPagePayload
  try {
    payload = JSON.parse(rawBody.toString("utf8"))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (payload.object !== "page") {
    return NextResponse.json({ ok: true, messages: 0, leads: 0 })
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    console.error("[Webhook/MetaPage] Aucune agence par défaut résolue")
    return NextResponse.json({ error: "No agency configured" }, { status: 503 })
  }

  const messages = await processMessagingEvents(agencyId, "messenger", payload)
  const { processed: leads, failures } = await processLeadgenIds(
    agencyId,
    extractLeadgenIds(payload),
  )

  if (failures.length > 0) {
    return NextResponse.json(
      { ok: false, messages, leads, failed: failures.length },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, messages, leads })
}
