/**
 * Logique pure du webhook PSP (Stripe / SPS Monétique Tunisie) — parsing,
 * normalisation et vérification montant/devise, séparés de la route HTTP et
 * de la DB pour être testables sans réseau ni base de données.
 *
 * ⚠️ Aucune intégration Stripe/SPS réelle n'existe encore dans ce projet
 * (aucun flux ne crée de PaymentIntent Stripe ni de session SPS — voir
 * lib/finance/recharge-actions.ts : seules les méthodes cash/virement/
 * mandat/chèque sont branchées, `card_international` reste "anticipé, pas
 * encore actif"). Le contrat de payload ci-dessous est donc une conception
 * best-effort documentée, PAS une fidélité vérifiée à la doc d'intégration
 * réelle de SPS (contrairement à MyGo, dont on avait le PDF fournisseur) —
 * à revalider avant tout branchement réel contre un compte Stripe/SPS.
 * Le mécanisme de corrélation (paymentReference == provider payment id) et
 * la vérification stricte montant/devise, eux, sont corrects quel que soit
 * le detail exact des noms de champs PSP.
 */

import { z } from "zod"

export interface NormalizedChargeEvent {
  eventId: string
  eventType: string
  /** Identifiant du paiement côté PSP — doit correspondre à
   * `wallet_recharge_requests.payment_reference` posé au moment où le
   * paiement en ligne a été initié. */
  providerRef: string
  /** Montant en TND, 3 décimales (millimes) — jamais en centimes : le
   * Dinar tunisien n'a pas la même granularité que les devises que Stripe
   * connaît nativement. */
  amountTnd: number
  currency: string
}

export type ChargeEventKind = "succeeded" | "failed" | "refunded" | "unknown"

export function classifyEventType(eventType: string): ChargeEventKind {
  if (eventType === "payment_intent.succeeded" || eventType === "charge.captured" || eventType === "sps.payment.captured") {
    return "succeeded"
  }
  if (eventType === "payment_intent.payment_failed" || eventType === "sps.payment.refused") {
    return "failed"
  }
  if (eventType === "charge.refunded" || eventType === "sps.payment.refunded") {
    return "refunded"
  }
  return "unknown"
}

/* -------------------------------------------------------------------------- */
/* Stripe                                                                      */
/* -------------------------------------------------------------------------- */

const stripeChargeObjectSchema = z.object({
  id: z.string().min(1),
  /** Montant TND en chaîne décimale ("150.000"), pas un entier de centimes
   * — voir note de fichier. */
  amount_tnd: z.union([z.string(), z.number()]),
  currency: z.string().min(1),
})

const stripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({
    object: stripeChargeObjectSchema,
  }),
})

export function normalizeStripeEvent(raw: unknown): NormalizedChargeEvent | null {
  const parsed = stripeEventSchema.safeParse(raw)
  if (!parsed.success) return null
  const obj = parsed.data.data.object
  const amountTnd = typeof obj.amount_tnd === "string" ? Number(obj.amount_tnd) : obj.amount_tnd
  if (!Number.isFinite(amountTnd)) return null
  return {
    eventId: parsed.data.id,
    eventType: parsed.data.type,
    providerRef: obj.id,
    amountTnd,
    currency: obj.currency.toUpperCase(),
  }
}

/* -------------------------------------------------------------------------- */
/* SPS Monétique Tunisie (payload form-urlencoded)                            */
/* -------------------------------------------------------------------------- */

export function normalizeSpsEvent(
  body: Record<string, string>,
  eventType: string,
): NormalizedChargeEvent | null {
  const eventId = body["event_id"] ?? body["transaction_id"]
  const providerRef = body["transaction_id"] ?? body["order_id"]
  const amountRaw = body["amount"]
  const currency = body["currency"]

  if (!eventId || !providerRef || !amountRaw || !currency) return null

  const amountTnd = Number(amountRaw)
  if (!Number.isFinite(amountTnd)) return null

  return {
    eventId,
    eventType,
    providerRef,
    amountTnd,
    currency: currency.toUpperCase(),
  }
}

/* -------------------------------------------------------------------------- */
/* Vérification contre la demande de recharge attendue                        */
/* -------------------------------------------------------------------------- */

export type ChargeMatchResult =
  | { ok: true }
  | { ok: false; reason: "REFERENCE_MISMATCH" | "CURRENCY_MISMATCH" | "AMOUNT_MISMATCH" }

/**
 * Ne fait jamais confiance au seul payload client/PSP : re-vérifie que le
 * paiement reçu correspond exactement (référence, devise, montant) à la
 * demande de recharge PENDING trouvée en base — jamais au montant que le
 * webhook prétend avoir capturé sans le confronter à ce qui était attendu.
 */
export function matchesPendingRecharge(
  request: { amount: string; paymentReference: string | null },
  charge: NormalizedChargeEvent,
): ChargeMatchResult {
  if (!request.paymentReference || request.paymentReference !== charge.providerRef) {
    return { ok: false, reason: "REFERENCE_MISMATCH" }
  }
  if (charge.currency !== "TND") {
    return { ok: false, reason: "CURRENCY_MISMATCH" }
  }
  const expected = parseFloat(request.amount)
  if (!Number.isFinite(expected) || Math.abs(expected - charge.amountTnd) > 0.001) {
    return { ok: false, reason: "AMOUNT_MISMATCH" }
  }
  return { ok: true }
}
