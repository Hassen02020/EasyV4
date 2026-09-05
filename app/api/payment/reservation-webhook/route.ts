/**
 * Webhook PSP — paiement en ligne d'une RÉSERVATION B2C (carte).
 *
 * Chemin ENTIÈREMENT séparé de app/api/payment/webhook/route.ts (qui
 * confirme des recharges de wallet B2B, `wallet_recharge_requests`) : même
 * structure et mêmes garanties de sécurité (signature → idempotence event →
 * audit → corrélation stricte → idempotence business → transition d'état),
 * mais corrélation sur `payments.pspOrderId` + `reservations`, jamais sur
 * `wallet_recharge_requests` — pour ne jamais risquer de régresser le
 * wallet B2B déjà en production en modifiant un chemin partagé.
 *
 * Sécurité (identique au webhook wallet) :
 *  1. Vérification signature HMAC avant toute logique (Stripe/SPS — mêmes
 *     fonctions signing.ts, réutilisées telles quelles).
 *  2. Idempotence event-level : chaque event_id n'est traité qu'une fois
 *     (payment_events, table partagée avec le webhook wallet — reservationId
 *     y est renseigné ici, jamais côté wallet).
 *  3. Idempotence business-level : un `payments` déjà `captured`/`failed`/
 *     `refunded` n'est jamais retraité, même sur un event_id différent pour
 *     le même paiement (Stripe envoie souvent payment_intent.succeeded ET
 *     charge.captured pour un seul paiement).
 *  4. Montant + devise re-vérifiés contre le `payments` PENDING attendu
 *     AVANT toute capture — jamais confiance au seul payload PSP (voir
 *     lib/payment/reservation-payment-logic.ts::matchesPendingPayment).
 *  5. Toute requête (signature valide ou non) est journalisée dans
 *     psp_webhooks.
 *
 * Cohérence paiement ↔ réservation : un paiement capturé alors que la
 * réservation n'est plus confirmable (expirée par le cron entre-temps,
 * déjà annulée...) reste honnêtement enregistré `captured` (l'argent a
 * réellement été reçu — jamais perdu de vue) mais NE confirme PAS la
 * réservation ; un événement d'audit explicite signale le cas pour
 * réconciliation manuelle par le staff plutôt qu'une confirmation forcée
 * d'un état qui ne le permet plus (voir isTransitionAllowed).
 *
 * La logique transactionnelle vit dans reservation-webhook-core.ts (testable
 * en DB-mode sans HTTP) — cette route ne fait que : parser/vérifier la
 * signature, appeler le cœur, puis déclencher facture/notification
 * best-effort hors transaction en cas de confirmation.
 */

import { type NextRequest, NextResponse } from "next/server"
import { withSystemContext } from "@/lib/db/tenant-context"
import { sendEvent } from "@/lib/inngest/client"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { verifySpsSignature, verifyStripeSignature } from "@/lib/payment/signing"
import { verifyPaymeeChecksum, normalizePaymeeStatus } from "@/lib/payment/paymee-signing"
import {
  normalizeSpsEvent,
  normalizeStripeEvent,
  normalizePaymeeEvent,
  type NormalizedChargeEvent,
} from "@/lib/payment/webhook-logic"
import {
  processReservationWebhookCore,
  loadConfirmedBookingDetail,
  type WebhookOutcome,
} from "@/lib/payment/reservation-webhook-core"

export async function POST(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") // 'stripe' | 'sps' | 'paymee'

  const rawBody = await request.arrayBuffer()
  const bodyBuffer = Buffer.from(rawBody)

  /* --- Vérification signature selon le PSP (identique au webhook wallet) --- */
  let charge: NormalizedChargeEvent | null = null
  let eventId: string
  let eventType: string
  let signatureOk = false
  let rawPayload: Record<string, unknown>

  if (provider === "stripe") {
    const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!stripeSecret) {
      console.error("[ReservationWebhook] STRIPE_WEBHOOK_SECRET manquant")
      return NextResponse.json({ error: "Misconfigured" }, { status: 500 })
    }
    const sig = request.headers.get("stripe-signature")
    signatureOk = verifyStripeSignature(bodyBuffer, sig, stripeSecret)
    if (!signatureOk) {
      console.warn("[ReservationWebhook/Stripe] Signature invalide — requête rejetée")
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
    rawPayload = raw as Record<string, unknown>
  } else if (provider === "sps") {
    const spsSecret = process.env.SPS_HMAC_KEY
    if (!spsSecret) {
      console.error("[ReservationWebhook] SPS_HMAC_KEY manquant")
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
      console.warn("[ReservationWebhook/SPS] Signature invalide — requête rejetée")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }
    rawPayload = body
    const spsType = body["event_type"] ?? body["status"] ?? "unknown"
    eventType = spsType
    charge = normalizeSpsEvent(body, spsType)
    eventId = charge?.eventId ?? body["transaction_id"] ?? body["order_id"] ?? `sps-unknown-${Date.now()}`
  } else if (provider === "paymee") {
    // Paymee — voir lib/payment/paymee-provider.ts et paymee-signing.ts pour
    // l'avertissement complet sur le contrat non vérifié contre la doc
    // primaire (accès réseau bloqué dans cet environnement de build).
    const paymeeApiKey = process.env.PAYMEE_API_KEY
    if (!paymeeApiKey) {
      console.error("[ReservationWebhook] PAYMEE_API_KEY manquant")
      return NextResponse.json({ error: "Misconfigured" }, { status: 500 })
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse(bodyBuffer.toString("utf8")) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    const token = typeof body["token"] === "string" ? body["token"] : null
    const checkSum =
      typeof body["check_sum"] === "string"
        ? body["check_sum"]
        : typeof body["checksum"] === "string"
          ? (body["checksum"] as string)
          : null
    if (!token) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 })
    }
    signatureOk = verifyPaymeeChecksum({
      token,
      paymentStatusRaw: body["payment_status"],
      checkSum,
      apiKey: paymeeApiKey,
    })
    if (!signatureOk) {
      console.warn("[ReservationWebhook/Paymee] check_sum invalide — requête rejetée")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }
    rawPayload = body
    const paymentStatus = normalizePaymeeStatus(body["payment_status"])
    const paymeeEventType = paymentStatus === true ? "paymee.payment.success" : "paymee.payment.failed"
    eventType = paymeeEventType
    charge = normalizePaymeeEvent(body, paymeeEventType)
    eventId = charge?.eventId ?? `paymee-${token}-${paymeeEventType}`
  } else {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 500 })
  }

  const result: WebhookOutcome = await withSystemContext((tx) =>
    processReservationWebhookCore(tx, {
      provider: provider as "stripe" | "sps" | "paymee",
      eventId,
      eventType,
      charge,
      signatureOk,
      rawPayload,
    }),
  )

  if (result.status === "captured_confirmed") {
    // Facture + notification hors transaction, best-effort — mêmes
    // conventions que lib/finance/manual-payment-actions.ts : la réservation
    // et le paiement sont déjà commités, un échec ici ne doit jamais
    // invalider un paiement réellement capturé.
    try {
      const invoiceResult = await generateInvoiceForReservation({
        agencyId: result.agencyId,
        reservationId: result.reservationId,
        actorUserId: "webhook",
      })
      if (!invoiceResult.ok) {
        console.error("[ReservationWebhook] génération facture échouée", invoiceResult.error)
      }
    } catch (err) {
      console.error(
        "[ReservationWebhook] génération facture échouée",
        err instanceof Error ? err.message : String(err),
      )
    }

    try {
      const detail = await withSystemContext((tx) => loadConfirmedBookingDetail(tx, result.reservationId))
      if (detail?.module === "hotel" && detail.customerEmail && detail.hotelName) {
        await sendEvent("booking/confirmed", {
          reservationId: result.reservationId,
          publicRef: result.publicRef,
          agencyId: result.agencyId,
          guestAccessToken: detail.guestAccessToken,
          customerEmail: detail.customerEmail,
          customerName: detail.customerName,
          customerPhone: detail.customerPhone ?? "",
          hotelName: detail.hotelName,
          checkIn: detail.checkIn ?? "",
          checkOut: detail.checkOut ?? "",
          nights: detail.nights ?? 1,
          adults: detail.adults ?? 1,
          children: detail.children,
          totalTnd: detail.totalTnd,
        }).catch(() => {
          /* fire-and-forget — le retry Inngest suffira */
        })
      }
    } catch (err) {
      console.error(
        "[ReservationWebhook] déclenchement voucher échoué",
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  console.log(
    JSON.stringify({
      level: "info",
      module: "reservation-webhook",
      provider,
      eventType: eventType!,
      eventId: eventId!,
      result: result.status,
    }),
  )

  return NextResponse.json({ ok: true, result: result.status })
}
