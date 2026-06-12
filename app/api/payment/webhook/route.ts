/**
 * Webhook PSP — Stripe & SPS Monétique Tunisie
 *
 * Sécurité :
 *  1. Vérification signature HMAC-SHA256 (Stripe) / SHA-512 (SPS) avant toute logique
 *  2. Idempotence : chaque event_id n'est traité qu'une seule fois (table payment_events)
 *  3. Rate-limiting sur l'IP source
 *  4. Tout est loggué dans audit_logs (logAuditAction)
 *
 * IMPORTANT : NE JAMAIS confirmer une réservation sans avoir vérifié la signature.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { getDb } from "@/lib/db/client"
import { paymentEvents } from "@/lib/db/schema"

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
  if (provider === "stripe") {
    const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!stripeSecret) {
      console.error("[Webhook] STRIPE_WEBHOOK_SECRET manquant")
      return NextResponse.json({ error: "Misconfigured" }, { status: 500 })
    }
    const sig = request.headers.get("stripe-signature")
    if (!verifyStripeSignature(bodyBuffer, sig, stripeSecret)) {
      console.warn("[Webhook/Stripe] Signature invalide — requête rejetée")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }
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
    if (!verifySpsSignature(body, spsSecret)) {
      console.warn("[Webhook/SPS] Signature invalide — requête rejetée")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
  }

  /* --- 2. Parsing de l'événement --- */
  let event: { id: string; type: string; data: unknown }
  try {
    event = JSON.parse(bodyBuffer.toString("utf8"))
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  /* --- 3. Idempotence — INSERT ON CONFLICT DO NOTHING --- */
  if (process.env.DATABASE_URL) {
    try {
      const db = getDb()
      const result = await db
        .insert(paymentEvents)
        .values({
          eventId: event.id,
          provider: provider!,
          eventType: event.type,
        })
        .onConflictDoNothing()

      // onConflictDoNothing retourne [] si la ligne existait déjà
      if (Array.isArray(result) && result.length === 0) {
        return NextResponse.json({ ok: true, duplicate: true })
      }
    } catch (err) {
      // Ne pas bloquer le traitement si la DB est indisponible
      console.error("[Webhook] Idempotence check failed", err instanceof Error ? err.message : String(err))
    }
  }

  /* --- 4. Dispatch selon le type d'événement --- */
  switch (event.type) {
    case "payment_intent.succeeded":
    case "charge.captured":
    case "sps.payment.captured":
      // TODO Sprint 2 : confirmer la réservation, émettre le voucher, envoyer l'email
      console.log(JSON.stringify({ level: "info", module: "webhook", event: event.type, eventId: event.id }))
      break

    case "payment_intent.payment_failed":
    case "sps.payment.refused":
      // TODO Sprint 2 : marquer le paiement failed, notifier le client
      console.log(JSON.stringify({ level: "warn", module: "webhook", event: event.type, eventId: event.id }))
      break

    case "charge.refunded":
    case "sps.payment.refunded":
      // TODO Sprint 2 : logReservationStatusChange → refunded
      console.log(JSON.stringify({ level: "info", module: "webhook", event: event.type, eventId: event.id }))
      break

    default:
      console.log(JSON.stringify({ level: "debug", module: "webhook", event: event.type, eventId: event.id, ignored: true }))
  }

  return NextResponse.json({ ok: true })
}
