/**
 * Paiement B2C réel — logique pure de corrélation webhook ↔ paiement de
 * réservation. Même discipline que `webhook-logic.ts::matchesPendingRecharge`
 * (réutilisé tel quel pour la recharge wallet B2B, jamais dupliqué/modifié
 * ici) : ne fait jamais confiance au seul payload PSP, revérifie référence +
 * devise + montant contre la ligne `payments` PENDING attendue avant toute
 * capture. Le webhook de réservation (app/api/payment/reservation-webhook/
 * route.ts) est un chemin ENTIÈREMENT séparé du webhook wallet
 * (app/api/payment/webhook/route.ts) — corrélation sur `payments.pspOrderId`
 * + `reservations`, jamais `wallet_recharge_requests` — pour ne jamais
 * risquer de régresser le B2B wallet déjà en production.
 */

import type { NormalizedChargeEvent } from "./webhook-logic"

/** Fenêtre de paiement en ligne carte — délai court (session de paiement
 * PSP), sans rapport avec la fenêtre 24h du règlement manuel différé
 * (virement/espèces, voir MANUAL_PAYMENT_WINDOW_MS dans guest-actions.ts) :
 * un client au milieu d'un paiement carte ne doit pas garder son offre
 * "réservée" pendant 24h, mais doit avoir largement le temps de compléter
 * la page PSP (3DS compris). */
export const ONLINE_PAYMENT_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

export type PaymentMatchResult =
  | { ok: true }
  | { ok: false; reason: "REFERENCE_MISMATCH" | "CURRENCY_MISMATCH" | "AMOUNT_MISMATCH" }

/**
 * Revérifie qu'un événement PSP normalisé correspond exactement (référence,
 * devise, montant) à la ligne `payments` PENDING attendue — jamais au
 * montant que le webhook prétend avoir capturé sans le confronter à ce qui
 * était attendu au moment de la création de la session de paiement.
 */
export function matchesPendingPayment(
  payment: { pspOrderId: string | null; originalAmount: string; originalCurrency: string },
  charge: NormalizedChargeEvent,
): PaymentMatchResult {
  if (!payment.pspOrderId || payment.pspOrderId !== charge.providerRef) {
    return { ok: false, reason: "REFERENCE_MISMATCH" }
  }
  if (charge.currency !== payment.originalCurrency.toUpperCase()) {
    return { ok: false, reason: "CURRENCY_MISMATCH" }
  }
  const expected = parseFloat(payment.originalAmount)
  if (!Number.isFinite(expected) || Math.abs(expected - charge.amountTnd) > 0.001) {
    return { ok: false, reason: "AMOUNT_MISMATCH" }
  }
  return { ok: true }
}
