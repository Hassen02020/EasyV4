/**
 * Tests unitaires — `lib/finance/refund-allocation.ts`.
 *
 * Couvre les scénarios Phase 16.2 explicitement requis : remboursement
 * partiel, remboursement total, remboursement > montant capturé rejeté,
 * remboursement traversant plusieurs lignes (Wallet + virement).
 */

import test from "node:test"
import assert from "node:assert/strict"

import { allocateRefund, type RefundableRow } from "../refund-allocation"

const EPSILON = 0.005

test("aucune ligne remboursable — NO_CAPTURED_PAYMENT", () => {
  const result = allocateRefund([], 100, EPSILON)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "NO_CAPTURED_PAYMENT")
})

test("remboursement total (amountTnd omis) — consomme tout le montant remboursable", () => {
  const rows: RefundableRow[] = [{ id: "p1", tndAmount: "1000.00", refundedAmount: "0" }]
  const result = allocateRefund(rows, undefined, EPSILON)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.requestedTnd, 1000)
    assert.equal(result.fullyRefunded, true)
    assert.deepEqual(result.updates, [{ id: "p1", newRefundedAmount: 1000, newStatus: "refunded" }])
  }
})

test("remboursement partiel (300 sur 1000) — ligne reste partial_refund, réservation pas fullyRefunded", () => {
  const rows: RefundableRow[] = [{ id: "p1", tndAmount: "1000.00", refundedAmount: "0" }]
  const result = allocateRefund(rows, 300, EPSILON)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.requestedTnd, 300)
    assert.equal(result.fullyRefunded, false)
    assert.deepEqual(result.updates, [{ id: "p1", newRefundedAmount: 300, newStatus: "partial_refund" }])
  }
})

test("remboursement > montant capturé — AMOUNT_EXCEEDS_CAPTURED, aucune mise à jour proposée", () => {
  const rows: RefundableRow[] = [{ id: "p1", tndAmount: "1000.00", refundedAmount: "0" }]
  const result = allocateRefund(rows, 1000.5, EPSILON)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "AMOUNT_EXCEEDS_CAPTURED")
})

test("remboursement traversant plusieurs lignes (wallet 300 + virement 200), demande 400 — consomme la 1re puis une partie de la 2e", () => {
  const rows: RefundableRow[] = [
    { id: "wallet", tndAmount: "300.00", refundedAmount: "0" },
    { id: "transfer", tndAmount: "200.00", refundedAmount: "0" },
  ]
  const result = allocateRefund(rows, 400, EPSILON)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.fullyRefunded, false)
    assert.deepEqual(result.updates, [
      { id: "wallet", newRefundedAmount: 300, newStatus: "refunded" },
      { id: "transfer", newRefundedAmount: 100, newStatus: "partial_refund" },
    ])
  }
})

test("remboursement exact du total remboursable multi-lignes — fullyRefunded true", () => {
  const rows: RefundableRow[] = [
    { id: "wallet", tndAmount: "300.00", refundedAmount: "0" },
    { id: "transfer", tndAmount: "200.00", refundedAmount: "0" },
  ]
  const result = allocateRefund(rows, 500, EPSILON)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.fullyRefunded, true)
    assert.deepEqual(result.updates, [
      { id: "wallet", newRefundedAmount: 300, newStatus: "refunded" },
      { id: "transfer", newRefundedAmount: 200, newStatus: "refunded" },
    ])
  }
})

test("une ligne déjà partiellement remboursée — une nouvelle demande dans la limite du restant remboursable réussit", () => {
  const rows: RefundableRow[] = [{ id: "p1", tndAmount: "300.00", refundedAmount: "100.00" }]
  const result = allocateRefund(rows, 150, EPSILON)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.totalRefundableTnd, 200)
    assert.deepEqual(result.updates, [{ id: "p1", newRefundedAmount: 250, newStatus: "partial_refund" }])
  }
})

test("une ligne déjà partiellement remboursée — dépasser le restant remboursable (200) est rejeté", () => {
  const rows: RefundableRow[] = [{ id: "p1", tndAmount: "300.00", refundedAmount: "100.00" }]
  const result = allocateRefund(rows, 250, EPSILON)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "AMOUNT_EXCEEDS_CAPTURED")
})

test("ligne déjà intégralement remboursée exclue de l'allocation (rowRefundable <= epsilon)", () => {
  const rows: RefundableRow[] = [
    { id: "already-refunded", tndAmount: "300.00", refundedAmount: "300.00" },
    { id: "still-captured", tndAmount: "200.00", refundedAmount: "0" },
  ]
  const result = allocateRefund(rows, 200, EPSILON)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.updates, [{ id: "still-captured", newRefundedAmount: 200, newStatus: "refunded" }])
  }
})

test("toutes les lignes déjà remboursées — NO_CAPTURED_PAYMENT (totalRefundableTnd sous l'epsilon)", () => {
  const rows: RefundableRow[] = [{ id: "p1", tndAmount: "300.00", refundedAmount: "300.00" }]
  const result = allocateRefund(rows, 10, EPSILON)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "NO_CAPTURED_PAYMENT")
})
