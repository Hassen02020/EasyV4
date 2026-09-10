/**
 * Tests unitaires — `lib/finance/payment-summary.ts`.
 *
 * Couvre les scénarios Phase 16.2 explicitement requis : 300+700=
 * FULLY_PAID, 300+200=PARTIALLY_PAID, restant calculé server-side (jamais
 * fourni par l'appelant), combinaison Wallet+virement.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { getReservationPaymentSummary, computePaymentState, type DrizzleLikeTx } from "../payment-summary"

interface MockPayment {
  tndAmount: string
  refundedAmount: string
}

function makeTx(reservationTotalTnd: string, capturedPayments: MockPayment[]): DrizzleLikeTx {
  let call = 0
  return {
    select: () => ({
      from: () => ({
        where: async () => {
          call += 1
          // 1er appel = SELECT reservations.tndAmount, 2e = SELECT payments.
          if (call === 1) return [{ tndAmount: reservationTotalTnd }]
          return capturedPayments
        },
      }),
    }),
  }
}

test("computePaymentState : UNPAID / PARTIALLY_PAID / FULLY_PAID", () => {
  assert.equal(computePaymentState(1000, 0), "UNPAID")
  assert.equal(computePaymentState(1000, 300), "PARTIALLY_PAID")
  assert.equal(computePaymentState(1000, 1000), "FULLY_PAID")
})

test("300 + 700 captured = FULLY_PAID, restant 0", async () => {
  const tx = makeTx("1000.00", [
    { tndAmount: "300.00", refundedAmount: "0" },
    { tndAmount: "700.00", refundedAmount: "0" },
  ])
  const summary = await getReservationPaymentSummary({ reservationId: "r1", txOverride: tx })
  assert.equal(summary.totalTnd, 1000)
  assert.equal(summary.collectedTnd, 1000)
  assert.equal(summary.remainingTnd, 0)
  assert.equal(summary.paymentState, "FULLY_PAID")
})

test("300 + 200 captured (sur 1000) = PARTIALLY_PAID, restant 500 — calculé server-side", async () => {
  const tx = makeTx("1000.00", [
    { tndAmount: "300.00", refundedAmount: "0" },
    { tndAmount: "200.00", refundedAmount: "0" },
  ])
  const summary = await getReservationPaymentSummary({ reservationId: "r1", txOverride: tx })
  assert.equal(summary.collectedTnd, 500)
  assert.equal(summary.remainingTnd, 500) // jamais fourni par l'appelant — dérivé de total - collected
  assert.equal(summary.paymentState, "PARTIALLY_PAID")
})

test("Wallet + virement combinés — sommés correctement quel que soit le nombre de lignes", async () => {
  const tx = makeTx("1000.00", [
    { tndAmount: "300.00", refundedAmount: "0" }, // wallet
    { tndAmount: "200.00", refundedAmount: "0" }, // transfer
    { tndAmount: "100.00", refundedAmount: "0" }, // deposit
  ])
  const summary = await getReservationPaymentSummary({ reservationId: "r1", txOverride: tx })
  assert.equal(summary.collectedTnd, 600)
  assert.equal(summary.remainingTnd, 400) // reste PAY_AT_HOTEL, aucune ligne fictive
  assert.equal(summary.paymentState, "PARTIALLY_PAID")
})

test("aucun paiement capturé = UNPAID, restant = total", async () => {
  const tx = makeTx("1000.00", [])
  const summary = await getReservationPaymentSummary({ reservationId: "r1", txOverride: tx })
  assert.equal(summary.collectedTnd, 0)
  assert.equal(summary.remainingTnd, 1000)
  assert.equal(summary.paymentState, "UNPAID")
})

test("un remboursement partiel réduit collected sans jamais passer sous zéro", async () => {
  const tx = makeTx("1000.00", [
    { tndAmount: "300.00", refundedAmount: "100.00" }, // partial_refund : net 200
    { tndAmount: "700.00", refundedAmount: "0" },
  ])
  const summary = await getReservationPaymentSummary({ reservationId: "r1", txOverride: tx })
  assert.equal(summary.collectedTnd, 900)
  assert.equal(summary.remainingTnd, 100)
  assert.equal(summary.paymentState, "PARTIALLY_PAID")
})

test("réservation introuvable — throw explicite, jamais un résumé fabriqué", async () => {
  const tx: DrizzleLikeTx = {
    select: () => ({
      from: () => ({ where: async () => [] }),
    }),
  }
  await assert.rejects(() => getReservationPaymentSummary({ reservationId: "missing", txOverride: tx }))
})
