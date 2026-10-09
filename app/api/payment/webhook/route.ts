/**
 * Webhook PSP — Stripe, SPS Monétique Tunisie, Paymee
 *
 * Sécurité :
 *  1. Vérification signature HMAC-SHA256 (Stripe) / SHA-512 (SPS) / MD5 check_sum (Paymee)
 *  2. Idempotence event-level : chaque event_id n'est traité qu'une seule fois (payment_events)
 *  3. Idempotence business-level : une demande de recharge déjà `validated`/`rejected`
 *     n'est jamais retraitée, même sur un event_id différent pour le même paiement
 *  4. Montant + devise du paiement re-vérifiés contre la demande de recharge attendue
 *     AVANT tout crédit — jamais confiance au seul payload PSP (voir webhook-logic.ts)
 *  5. Toute requête (signature valide ou non) est journalisée dans psp_webhooks
 *
 * IMPORTANT : NE JAMAIS créditer un wallet sans avoir vérifié la signature ET
 * fait correspondre exactement référence + devise + montant à une demande de
 * recharge PENDING existante.
 *
 * Portée actuelle : ce webhook confirme des RECHARGES wallet en ligne
 * (carte bancaire), pas des paiements par réservation — ce projet fait payer
 * chaque réservation par débit du solde wallet déjà crédité (voir
 * lib/pro/booking-actions.ts::debitPartnerCredit), il n'y a pas de paiement
 * PSP par réservation à confirmer ici.
 */

import { type NextRequest, NextResponse } from "next/server"
import { withSystemContext } from "@/lib/db/tenant-context"
import { sendEvent } from "@/lib/inngest/client"
import {
  verifySpsSignature,
  verifyStripeSignature,
} from "@/lib/payment/signing"
import {
  verifyPaymeeChecksum,
  normalizePaymeeStatus,
} from "@/lib/payment/paymee-signing"
import {
  normalizeSpsEvent,
  normalizeStripeEvent,
  normalizePaymeeEvent,
  type NormalizedChargeEvent,
} from "@/lib/payment/webhook-logic"
import { processWalletWebhookCore } from "@/lib/payment/wallet-webhook-core"

/* -------------------------------------------------------------------------- */
/* Route handler                                                               */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") // 'stripe' | 'sps' | 'paymee'

  const rawBody = await request.arrayBuffer()
  const bodyBuffer = Buffer.from(rawBody)

  /* --- 1. Vérification signature selon le PSP --- */
  let charge: NormalizedChargeEvent | null = null
  let eventId: string
  let eventType: string
  let signatureOk = false
  let spsBody: Record<string, string> | null = null

  if (provider === "stripe") {
    const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!stripeSecret) {
      console.error("[Webhook] STRIPE_WEBHOOK_SECRET manquant")
      return NextResponse.json({ error: "Misconfigured" }, { status: 500 })
    }
    const sig = request.headers.get("stripe-signature")
    signatureOk = verifyStripeSignature(bodyBuffer, sig, stripeSecret)
    if (!signatureOk) {
      console.warn("[Webhook/Stripe] Signature invalide — requête rejetée")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    let raw: unknown
    try {
      raw = JSON.parse(bodyBuffer.toString("utf8"))
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    const parsed = raw as { id?: unknown; type?: unknown }
    if (typeof parsed.id !== "string" || typeof parsed.type !== "string") {
      return NextResponse.json(
        { error: "Invalid event shape" },
        { status: 400 },
      )
    }
    eventId = parsed.id
    eventType = parsed.type
    charge = normalizeStripeEvent(raw)
  } else if (provider === "sps") {
    const spsSecret = process.env.SPS_HMAC_KEY
    if (!spsSecret) {
      console.error("[Webhook] SPS_HMAC_KEY manquant")
      return NextResponse.json({ error: "Misconfigured" }, { status: 500 })
    }
    let body: Record<string, string>
    try {
      body = Object.fromEntries(
        new URLSearchParams(bodyBuffer.toString("utf8")),
      )
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }
    signatureOk = verifySpsSignature(body, spsSecret)
    if (!signatureOk) {
      console.warn("[Webhook/SPS] Signature invalide — requête rejetée")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }
    spsBody = body
    const spsType = body["event_type"] ?? body["status"] ?? "unknown"
    eventType = spsType
    charge = normalizeSpsEvent(body, spsType)
    eventId =
      charge?.eventId ??
      body["transaction_id"] ??
      body["order_id"] ??
      `sps-unknown-${Date.now()}`
  } else if (provider === "paymee") {
    const paymeeApiKey = process.env.PAYMEE_API_KEY
    if (!paymeeApiKey) {
      console.error("[Webhook/Paymee] PAYMEE_API_KEY manquant")
      return NextResponse.json({ error: "Misconfigured" }, { status: 500 })
    }
    let paymeeBody: Record<string, unknown>
    try {
      paymeeBody = JSON.parse(bodyBuffer.toString("utf8"))
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    const token =
      typeof paymeeBody["token"] === "string" ? paymeeBody["token"] : null
    const checkSum =
      typeof paymeeBody["check_sum"] === "string"
        ? paymeeBody["check_sum"]
        : null
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }
    signatureOk = verifyPaymeeChecksum({
      token,
      paymentStatusRaw: paymeeBody["payment_status"],
      checkSum,
      apiKey: paymeeApiKey,
    })
    if (!signatureOk) {
      console.warn("[Webhook/Paymee] Signature invalide — requête rejetée")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }
    const status = normalizePaymeeStatus(paymeeBody["payment_status"])
    eventType =
      status === true ? "paymee.payment.success" : "paymee.payment.failed"
    charge = normalizePaymeeEvent(paymeeBody, eventType)
    eventId = charge?.eventId ?? `paymee-${token}-${Date.now()}`
  } else {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Base de données non configurée" },
      { status: 500 },
    )
  }

  /* --- 2. Journal brut (audit) — parser le payload pour toute la suite --- */
  const auditPayload: Record<string, unknown> =
    spsBody ?? JSON.parse(bodyBuffer.toString("utf8"))

  const result = await withSystemContext((tx) =>
    processWalletWebhookCore(tx, {
      provider: provider as "stripe" | "sps" | "paymee",
      eventId: eventId!,
      eventType: eventType!,
      charge,
      signatureOk,
      auditPayload,
    }),
  )

  if (result.status === "credited") {
    await sendEvent("wallet/credited", {
      agencyId: result.agencyId,
      txId: result.txId,
      amount: result.amount,
      newBalance: result.newBalance,
      method: `PSP_${provider.toUpperCase()}`,
      adminUserId: "webhook",
    }).catch(() => {
      /* fire-and-forget — le retry Inngest suffira */
    })
  }

  console.log(
    JSON.stringify({
      level: "info",
      module: "webhook",
      provider,
      eventType: eventType!,
      eventId: eventId!,
      result: result.status,
    }),
  )

  return NextResponse.json({ ok: true, result: result.status })
}
