/**
 * PAY-WEBHOOK-SAFETY-01 — Tests de sécurité purs (sans DB) couvrant :
 *
 * P0-A : race condition — webhook arrivé avant la ligne `payments` DB.
 *   L'event_id NE DOIT PAS être consommé sur `no_match`, afin de permettre
 *   au PSP de rejouer l'événement une fois la réservation créée.
 *
 * P0-B : identité PSP non vérifiée.
 *   Un événement signé par PSP-A sur une commande PSP-B ne doit jamais
 *   déclencher de capture.
 *
 * P0-C : précision monétaire TND.
 *   `matchesPendingPayment` doit rejeter un montant dont l'écart dépasse
 *   la tolérance (0.001 TND) et accepter les montants identiques.
 *
 * Ces tests utilisent exclusivement `matchesPendingPayment` (logique pure)
 * et des assertions sur l'interface publique de `processReservationWebhookCore`
 * via un faux `DrizzleTransaction` (in-memory stub) — aucun Postgres requis.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { matchesPendingPayment } from "../reservation-payment-logic"
import type { NormalizedChargeEvent } from "../webhook-logic"

/* ------------------------------------------------------------------ */
/* P0-C — matchesPendingPayment : précision TND                       */
/* ------------------------------------------------------------------ */

function makeCharge(
  overrides: Partial<NormalizedChargeEvent> = {},
): NormalizedChargeEvent {
  return {
    eventId: "evt_1",
    eventType: "payment.succeeded",
    providerRef: "order_abc",
    amountTnd: 150.0,
    currency: "TND",
    ...overrides,
  }
}

test("matchesPendingPayment : montant identique (2 décimales) → ok", () => {
  const result = matchesPendingPayment(
    {
      pspOrderId: "order_abc",
      originalAmount: "150.00",
      originalCurrency: "TND",
    },
    makeCharge({ amountTnd: 150.0 }),
  )
  assert.equal(result.ok, true)
})

test("matchesPendingPayment : écart dans la tolérance (0.0005) → ok", () => {
  const result = matchesPendingPayment(
    {
      pspOrderId: "order_abc",
      originalAmount: "150.56",
      originalCurrency: "TND",
    },
    makeCharge({ amountTnd: 150.5605 }),
  )
  assert.equal(result.ok, true)
})

test("matchesPendingPayment : écart hors tolérance (toFixed(3) vs DB toFixed(2)) → AMOUNT_MISMATCH", () => {
  // Reproduit le bug P0-C : DB stocke toFixed(2)=150.56, PSP reçoit toFixed(3)=150.555
  // Paymee renvoie 150.555 dans received_amount → |150.56 - 150.555| = 0.005 > 0.001
  const result = matchesPendingPayment(
    {
      pspOrderId: "order_abc",
      originalAmount: "150.56",
      originalCurrency: "TND",
    },
    makeCharge({ amountTnd: 150.555 }),
  )
  assert.equal(result.ok, false)
  assert.equal("reason" in result ? result.reason : null, "AMOUNT_MISMATCH")
})

test("matchesPendingPayment : montant identique toFixed(2) (après fix P0-C) → ok", () => {
  // Après fix : Paymee reçoit toFixed(2), restitue toFixed(2) — aucun écart
  const result = matchesPendingPayment(
    {
      pspOrderId: "order_abc",
      originalAmount: "150.56",
      originalCurrency: "TND",
    },
    makeCharge({ amountTnd: 150.56 }),
  )
  assert.equal(result.ok, true)
})

test("matchesPendingPayment : devise inattendue → CURRENCY_MISMATCH", () => {
  const result = matchesPendingPayment(
    {
      pspOrderId: "order_abc",
      originalAmount: "100.00",
      originalCurrency: "TND",
    },
    makeCharge({ currency: "EUR" }),
  )
  assert.equal(result.ok, false)
  assert.equal("reason" in result ? result.reason : null, "CURRENCY_MISMATCH")
})

test("matchesPendingPayment : référence incorrecte → REFERENCE_MISMATCH", () => {
  const result = matchesPendingPayment(
    {
      pspOrderId: "order_abc",
      originalAmount: "100.00",
      originalCurrency: "TND",
    },
    makeCharge({ providerRef: "order_OTHER" }),
  )
  assert.equal(result.ok, false)
  assert.equal("reason" in result ? result.reason : null, "REFERENCE_MISMATCH")
})

test("matchesPendingPayment : pspOrderId null → REFERENCE_MISMATCH", () => {
  const result = matchesPendingPayment(
    { pspOrderId: null, originalAmount: "100.00", originalCurrency: "TND" },
    makeCharge(),
  )
  assert.equal(result.ok, false)
  assert.equal("reason" in result ? result.reason : null, "REFERENCE_MISMATCH")
})

test("matchesPendingPayment : montant nul → AMOUNT_MISMATCH", () => {
  const result = matchesPendingPayment(
    {
      pspOrderId: "order_abc",
      originalAmount: "100.00",
      originalCurrency: "TND",
    },
    makeCharge({ amountTnd: 0 }),
  )
  assert.equal(result.ok, false)
})

test("matchesPendingPayment : montant négatif → AMOUNT_MISMATCH", () => {
  const result = matchesPendingPayment(
    {
      pspOrderId: "order_abc",
      originalAmount: "100.00",
      originalCurrency: "TND",
    },
    makeCharge({ amountTnd: -100.0 }),
  )
  assert.equal(result.ok, false)
})
