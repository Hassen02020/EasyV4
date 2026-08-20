/**
 * Webhook PSP — Stripe & SPS Monétique Tunisie
 *
 * Sécurité :
 *  1. Vérification signature HMAC-SHA256 (Stripe) / SHA-512 (SPS) avant toute logique
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
import { createHmac, timingSafeEqual } from "crypto"
import { eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { paymentEvents, pspWebhooks, walletRechargeRequests } from "@/lib/db/schema"
import { sendEvent } from "@/lib/inngest/client"
import { creditRechargeRequest } from "@/lib/finance/wallet-credit"
import {
  classifyEventType,
  matchesPendingRecharge,
  normalizeSpsEvent,
  normalizeStripeEvent,
  type NormalizedChargeEvent,
} from "@/lib/payment/webhook-logic"

/* -------------------------------------------------------------------------- */
/* Helpers de vérification de signature                                       */
/* -------------------------------------------------------------------------- */

/**
 * Vérifie la signature Stripe (header `stripe-signature`).
 * Utilise `timingSafeEqual` pour éviter les timing attacks.
 */
function verifyStripeSignature(
  payload: Buffer,
  sigHeader: string | null,
  secret: string,
): boolean {
  if (!sigHeader) return false
  const parts = Object.fromEntries(
    sigHeader.split(",").map((s) => s.split("=")),
  )
  const timestamp = parts["t"]
  const v1 = parts["v1"]
  if (!timestamp || !v1) return false

  const signed = `${timestamp}.${payload.toString("utf8")}`
  const expected = createHmac("sha256", secret).update(signed).digest("hex")
  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"))
  } catch {
    return false
  }
}

/**
 * Vérifie la signature SPS Monétique Tunisie (champ `seal` SHA-512).
 * Format SPS : HMAC-SHA512(concatenation des champs triés alphabétiquement)
 */
function verifySpsSignature(
  body: Record<string, string>,
  secret: string,
): boolean {
  const seal = body["seal"]
  if (!seal) return false

  const sortedKeys = Object.keys(body)
    .filter((k) => k !== "seal")
    .sort()
  const message = sortedKeys.map((k) => body[k]).join("+")
  const expected = createHmac("sha512", secret).update(message).digest("hex")
  try {
    return timingSafeEqual(
      Buffer.from(seal.toLowerCase()),
      Buffer.from(expected.toLowerCase()),
    )
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* Route handler                                                               */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") // 'stripe' | 'sps'

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
      return NextResponse.json({ error: "Invalid event shape" }, { status: 400 })
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
      body = Object.fromEntries(new URLSearchParams(bodyBuffer.toString("utf8")))
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
    eventId = charge?.eventId ?? body["transaction_id"] ?? body["order_id"] ?? `sps-unknown-${Date.now()}`
  } else {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 500 })
  }

  const result = await withSystemContext(async (tx) => {
    /* --- 2. Idempotence event-level — INSERT ON CONFLICT DO NOTHING --- */
    const inserted = await tx
      .insert(paymentEvents)
      .values({ eventId, provider, eventType })
      .onConflictDoNothing()
      .returning({ eventId: paymentEvents.eventId })

    if (inserted.length === 0) {
      return { status: "duplicate" as const }
    }

    /* --- 3. Journal brut (audit) — toute requête signée valide est tracée --- */
    const auditPayload: Record<string, unknown> = spsBody ?? JSON.parse(bodyBuffer.toString("utf8"))

    const kind = classifyEventType(eventType)

    if (kind === "unknown" || !charge) {
      await tx.insert(pspWebhooks).values({
        agencyId: null,
        psp: provider as "stripe" | "sps",
        eventType,
        payload: auditPayload,
        signatureOk,
        processedAt: new Date(),
        error: !charge ? "UNPARSEABLE_PAYLOAD" : null,
      })
      return { status: "ignored" as const }
    }

    // Corrélation : le paiement doit référencer une demande de recharge en
    // attente posée par submitRechargeRequest (payment_reference == provider
    // payment id). Verrouillée pour éviter un double traitement concurrent
    // avec validateRechargeRequest (approbation manuelle) ou un autre webhook.
    const [pending] = await tx
      .select()
      .from(walletRechargeRequests)
      .where(eq(walletRechargeRequests.paymentReference, charge.providerRef))
      .for("update")

    if (!pending) {
      await tx.insert(pspWebhooks).values({
        agencyId: null,
        psp: provider as "stripe" | "sps",
        eventType,
        payload: auditPayload,
        signatureOk,
        processedAt: new Date(),
        error: "NO_MATCHING_RECHARGE_REQUEST",
      })
      return { status: "no_match" as const }
    }

    if (pending.status !== "pending") {
      // Déjà traité (validé ou rejeté) — un second event_id pour le même
      // paiement (Stripe envoie souvent payment_intent.succeeded ET
      // charge.captured pour un seul paiement) ne doit jamais re-créditer.
      await tx.insert(pspWebhooks).values({
        agencyId: pending.agencyId,
        psp: provider as "stripe" | "sps",
        eventType,
        payload: auditPayload,
        signatureOk,
        processedAt: new Date(),
        error: `ALREADY_PROCESSED:${pending.status}`,
      })
      return { status: "already_processed" as const }
    }

    if (kind === "failed") {
      await tx
        .update(walletRechargeRequests)
        .set({
          status: "rejected",
          rejectionReason: "Paiement refusé par le PSP",
          reviewedByUserId: null,
          reviewedAt: new Date(),
        })
        .where(eq(walletRechargeRequests.id, pending.id))

      await tx.insert(pspWebhooks).values({
        agencyId: pending.agencyId,
        psp: provider as "stripe" | "sps",
        eventType,
        payload: auditPayload,
        signatureOk,
        processedAt: new Date(),
      })
      return { status: "payment_failed" as const, agencyId: pending.agencyId }
    }

    if (kind === "refunded") {
      // Remboursement d'une recharge déjà créditée n'est possible que si la
      // demande a bien été validée (sinon rien à annuler — un refund sur une
      // recharge encore pending, jamais créditée, est ignoré : STRIPE ne
      // devrait pas l'envoyer avant un succeeded, mais on ne suppose rien).
      await tx.insert(pspWebhooks).values({
        agencyId: pending.agencyId,
        psp: provider as "stripe" | "sps",
        eventType,
        payload: auditPayload,
        signatureOk,
        processedAt: new Date(),
        error: "REFUND_ON_NON_VALIDATED_REQUEST",
      })
      return { status: "refund_ignored" as const }
    }

    // kind === "succeeded"
    const match = matchesPendingRecharge(pending, charge)
    if (!match.ok) {
      await tx
        .update(walletRechargeRequests)
        .set({
          status: "rejected",
          rejectionReason: `Paiement PSP non conforme à la demande (${match.reason})`,
          reviewedByUserId: null,
          reviewedAt: new Date(),
        })
        .where(eq(walletRechargeRequests.id, pending.id))

      await tx.insert(pspWebhooks).values({
        agencyId: pending.agencyId,
        psp: provider as "stripe" | "sps",
        eventType,
        payload: auditPayload,
        signatureOk,
        processedAt: new Date(),
        error: match.reason,
      })
      console.warn("[Webhook] Paiement PSP rejeté — écart avec la demande", {
        requestId: pending.id,
        reason: match.reason,
      })
      return { status: "mismatch" as const, reason: match.reason }
    }

    const outcome = await creditRechargeRequest(tx, pending, {
      reviewedByUserId: null,
      description: `Recharge en ligne — ${provider.toUpperCase()} (webhook ${eventType}, réf. ${charge.providerRef})`,
    })

    await tx.insert(pspWebhooks).values({
      agencyId: pending.agencyId,
      psp: provider as "stripe" | "sps",
      eventType,
      payload: auditPayload,
      signatureOk,
      processedAt: new Date(),
    })

    return {
      status: "credited" as const,
      agencyId: outcome.agencyId,
      txId: outcome.movementId,
      amount: outcome.amount,
      newBalance: outcome.newBalance,
    }
  })

  if (result.status === "credited") {
    await sendEvent("wallet/credited", {
      agencyId: result.agencyId,
      txId: result.txId,
      amount: result.amount,
      newBalance: result.newBalance,
      method: `PSP_${provider.toUpperCase()}`,
      adminUserId: "webhook",
    }).catch(() => { /* fire-and-forget — le retry Inngest suffira */ })
  }

  console.log(JSON.stringify({ level: "info", module: "webhook", provider, eventType: eventType!, eventId: eventId!, result: result.status }))

  return NextResponse.json({ ok: true, result: result.status })
}
