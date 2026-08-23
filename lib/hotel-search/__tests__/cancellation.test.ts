import { test } from "node:test"
import assert from "node:assert/strict"
import { cancellationStatusFor } from "../cancellation"

test("cancellationStatusFor : notRefundable -> non_refundable, même avec une politique gratuite présente", () => {
  const status = cancellationStatusFor({
    notRefundable: true,
    cancellationPolicies: [
      { nature: "BEFORE_ARRIVAL", fees: 0, fromDate: "2026-01-01" },
    ],
  })
  assert.deepEqual(status, { kind: "non_refundable" })
})

test("cancellationStatusFor : politique BEFORE_ARRIVAL sans frais -> free avec la vraie date", () => {
  const status = cancellationStatusFor({
    notRefundable: false,
    cancellationPolicies: [
      { nature: "BEFORE_ARRIVAL", fees: 0, fromDate: "2026-03-15" },
    ],
  })
  assert.deepEqual(status, { kind: "free", beforeDate: "2026-03-15" })
})

test("cancellationStatusFor : politique BEFORE_ARRIVAL avec frais -> unknown, pas de free fabriqué", () => {
  const status = cancellationStatusFor({
    notRefundable: false,
    cancellationPolicies: [
      { nature: "BEFORE_ARRIVAL", fees: 50, fromDate: "2026-03-15" },
    ],
  })
  assert.deepEqual(status, { kind: "unknown" })
})

test("cancellationStatusFor : politique BEFORE_ARRIVAL sans frais mais sans fromDate -> unknown", () => {
  const status = cancellationStatusFor({
    notRefundable: false,
    cancellationPolicies: [{ nature: "BEFORE_ARRIVAL", fees: 0 }],
  })
  assert.deepEqual(status, { kind: "unknown" })
})

test("cancellationStatusFor : aucune politique -> unknown", () => {
  const status = cancellationStatusFor({
    notRefundable: false,
    cancellationPolicies: [],
  })
  assert.deepEqual(status, { kind: "unknown" })
})

test("cancellationStatusFor : politique d'une autre nature (ex. AFTER_ARRIVAL) ignorée -> unknown", () => {
  const status = cancellationStatusFor({
    notRefundable: false,
    cancellationPolicies: [
      { nature: "AFTER_ARRIVAL", fees: 0, fromDate: "2026-03-15" },
    ],
  })
  assert.deepEqual(status, { kind: "unknown" })
})

test("cancellationStatusFor : plusieurs politiques, la première BEFORE_ARRIVAL sans frais gagne", () => {
  const status = cancellationStatusFor({
    notRefundable: false,
    cancellationPolicies: [
      { nature: "AFTER_ARRIVAL", fees: 100, fromDate: "2026-02-01" },
      { nature: "BEFORE_ARRIVAL", fees: 20, fromDate: "2026-02-10" },
      { nature: "BEFORE_ARRIVAL", fees: 0, fromDate: "2026-02-20" },
    ],
  })
  assert.deepEqual(status, { kind: "free", beforeDate: "2026-02-20" })
})
