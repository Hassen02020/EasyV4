/**
 * Virtual Payment Provider — générateur de requêtes webhook PSP réalistes
 * pour les tests, hors production.
 *
 * Contrairement au Virtual MyGo Supplier (lib/mygo/virtual-supplier/), il
 * n'existe dans ce projet AUCUN appel sortant vers un vrai PSP à intercepter
 * (aucun flux ne crée de PaymentIntent Stripe ni de session SPS — voir la
 * note de webhook-logic.ts) : il n'y a donc rien côté "provider hébergé" à
 * simuler. Ce qu'on peut construire et qui a une vraie valeur de test, c'est
 * le CÔTÉ ENTRANT — des requêtes webhook signées avec le même algorithme
 * que le vrai PSP utiliserait (lib/payment/signing.ts, partagé avec la
 * route réelle), pour exercer app/api/payment/webhook/route.ts exactement
 * comme un vrai événement Stripe/SPS le ferait.
 *
 * Usage (test manuel / script) :
 *   const req = buildVirtualWebhookRequest("CARD_SUCCESS", {
 *     provider: "stripe", providerRef: "pi_test_1", amountTnd: 150,
 *     stripeSecret: process.env.STRIPE_WEBHOOK_SECRET!,
 *   })
 *   await fetch(`${baseUrl}/api/payment/webhook?provider=stripe`, {
 *     method: "POST", headers: req.headers, body: req.body,
 *   })
 */

import { buildStripeSignatureHeader, computeSpsSeal } from "./signing"

export type VirtualPaymentScenario =
  | "CARD_SUCCESS"
  | "CARD_DECLINED"
  | "INVALID_SIGNATURE"
  | "WRONG_AMOUNT"
  | "WRONG_CURRENCY"
  | "UNKNOWN_REFERENCE"
  | "DUPLICATE_WEBHOOK"
  | "REFUND"
  | "UNKNOWN_EVENT_TYPE"

export interface VirtualWebhookOptions {
  provider: "stripe" | "sps"
  /** Doit correspondre à `wallet_recharge_requests.payment_reference` pour
   * CARD_SUCCESS/CARD_DECLINED/REFUND ; ignoré pour UNKNOWN_REFERENCE (une
   * référence aléatoire est générée à la place). */
  providerRef: string
  /** Montant TND attendu par la demande de recharge ciblée. */
  amountTnd: number
  /** Secret HMAC — STRIPE_WEBHOOK_SECRET ou SPS_HMAC_KEY selon `provider`.
   * Pour INVALID_SIGNATURE, un secret délibérément différent est utilisé. */
  secret: string
  eventId?: string
}

export interface VirtualWebhookRequest {
  scenario: VirtualPaymentScenario
  url: (baseUrl: string) => string
  headers: Record<string, string>
  body: string
}

function stripeEventPayload(
  eventId: string,
  type: string,
  providerRef: string,
  amountTnd: number,
  currency = "tnd",
): string {
  return JSON.stringify({
    id: eventId,
    type,
    data: { object: { id: providerRef, amount_tnd: amountTnd.toFixed(3), currency } },
  })
}

function spsEventBody(
  fields: Record<string, string>,
): Record<string, string> {
  return { ...fields }
}

/**
 * Construit une requête webhook signée pour un scénario donné. Le payload
 * "invalide" (WRONG_AMOUNT, WRONG_CURRENCY, UNKNOWN_REFERENCE) est signé
 * correctement — c'est le CONTENU qui doit être rejeté par la logique
 * métier (matchesPendingRecharge), pas la signature. INVALID_SIGNATURE est
 * le seul scénario où la signature elle-même est fausse.
 */
export function buildVirtualWebhookRequest(
  scenario: VirtualPaymentScenario,
  opts: VirtualWebhookOptions,
): VirtualWebhookRequest {
  const eventId = opts.eventId ?? `virtual-${scenario.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const ref =
    scenario === "UNKNOWN_REFERENCE"
      ? `unknown-ref-${Math.random().toString(36).slice(2, 10)}`
      : opts.providerRef
  const amount =
    scenario === "WRONG_AMOUNT" ? opts.amountTnd + 1000 : opts.amountTnd
  const currency = scenario === "WRONG_CURRENCY" ? "eur" : "tnd"

  const eventType: string =
    scenario === "CARD_DECLINED"
      ? "payment_intent.payment_failed"
      : scenario === "REFUND"
        ? "charge.refunded"
        : scenario === "UNKNOWN_EVENT_TYPE"
          ? "customer.created"
          : "payment_intent.succeeded"

  if (opts.provider === "stripe") {
    const payload = stripeEventPayload(eventId, eventType, ref, amount, currency)
    const signingSecret = scenario === "INVALID_SIGNATURE" ? `${opts.secret}-wrong` : opts.secret
    return {
      scenario,
      url: (baseUrl) => `${baseUrl}/api/payment/webhook?provider=stripe`,
      headers: {
        "content-type": "application/json",
        "stripe-signature": buildStripeSignatureHeader(payload, signingSecret),
      },
      body: payload,
    }
  }

  // SPS : payload form-urlencoded, seal = HMAC-SHA512 des champs triés
  const fields = spsEventBody({
    event_id: eventId,
    transaction_id: ref,
    amount: amount.toFixed(3),
    currency: currency.toUpperCase(),
    event_type:
      eventType === "payment_intent.succeeded"
        ? "sps.payment.captured"
        : eventType === "payment_intent.payment_failed"
          ? "sps.payment.refused"
          : eventType === "charge.refunded"
            ? "sps.payment.refunded"
            : "sps.unknown",
  })
  const signingSecret = scenario === "INVALID_SIGNATURE" ? `${opts.secret}-wrong` : opts.secret
  fields.seal = computeSpsSeal(fields, signingSecret)
  const body = new URLSearchParams(fields).toString()

  return {
    scenario,
    url: (baseUrl) => `${baseUrl}/api/payment/webhook?provider=sps`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  }
}

/** DUPLICATE_WEBHOOK n'est pas un payload différent — c'est le MÊME
 * VirtualWebhookRequest (même event_id) envoyé deux fois. Le test doit
 * construire une requête CARD_SUCCESS puis la poster deux fois. */
export const DUPLICATE_WEBHOOK_NOTE =
  "DUPLICATE_WEBHOOK: réutiliser le même VirtualWebhookRequest (même eventId), le poster 2 fois."
