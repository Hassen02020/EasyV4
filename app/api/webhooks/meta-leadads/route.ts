/**
 * META-LEADADS-WEBHOOK-01 — webhook entrant Meta Lead Ads (champ `leadgen`
 * de l'abonnement webhook d'une Page Facebook).
 *
 * GET  — handshake de vérification Meta (`hub.mode`/`hub.verify_token`/
 *        `hub.challenge`), même mécanisme que
 *        app/api/webhooks/whatsapp/route.ts (c'est le même protocole Meta,
 *        pas une coïncidence) — verify token DÉDIÉ
 *        (META_LEADADS_VERIFY_TOKEN), jamais réutilisé tel quel pour
 *        éviter qu'une seule fuite de token ouvre les deux webhooks.
 * POST — notifications `leadgen` réelles. Le payload ne contient JAMAIS
 *        les données du lead (voir lib/meta-leadads/provider.ts) — un
 *        second appel Graph API authentifié est nécessaire pour les
 *        récupérer.
 *
 * Sécurité, même discipline que le webhook WhatsApp :
 *  1. Signature HMAC-SHA256 vérifiée AVANT toute logique
 *     (lib/whatsapp/signing.ts — générique Meta malgré son nom, voir sa
 *     propre en-tête ; réutilisée telle quelle, jamais dupliquée).
 *  2. Idempotence sur `leadgenId` (lib/meta-leadads/lead-capture-core.ts).
 *  4. G-05 : un lead non récupéré/enregistré → trace `audit_events` + 500
 *     pour que Meta relivre (lib/meta-leadads/webhook-batch.ts).
 *  3. Toute requête sans credentials configurés échoue explicitement
 *     (503) — jamais un faux succès.
 */

import { type NextRequest, NextResponse } from "next/server"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { verifyWhatsAppSignature } from "@/lib/whatsapp/signing"
import {
  extractLeadgenIds,
  processLeadgenIds,
  type MetaPagePayload,
} from "@/lib/meta/page-webhook-core"

export async function GET(request: NextRequest) {
  const verifyToken = process.env.META_LEADADS_VERIFY_TOKEN
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
    console.error("[Webhook/MetaLeadAds] META_APP_SECRET manquant")
    return NextResponse.json({ error: "Misconfigured" }, { status: 503 })
  }

  const rawBody = Buffer.from(await request.arrayBuffer())
  const signatureOk = verifyWhatsAppSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    appSecret,
  )
  if (!signatureOk) {
    console.warn("[Webhook/MetaLeadAds] Signature invalide — requête rejetée")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  let payload: MetaPagePayload
  try {
    payload = JSON.parse(rawBody.toString("utf8"))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    console.error("[Webhook/MetaLeadAds] Aucune agence par défaut résolue")
    return NextResponse.json({ error: "No agency configured" }, { status: 503 })
  }

  // G-05 — tout échec (Meta, base) est tracé et renvoie 500 : Meta relivre
  // la notification, les leads déjà enregistrés du lot sont ignorés au
  // renvoi (idempotence leadgen_id). Code partagé avec /meta-page
  // (CRM-META-CONNECT-01).
  const { processed, failures } = await processLeadgenIds(
    agencyId,
    extractLeadgenIds(payload),
  )

  if (failures.length > 0) {
    return NextResponse.json(
      { ok: false, processed, failed: failures.length },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, processed })
}
