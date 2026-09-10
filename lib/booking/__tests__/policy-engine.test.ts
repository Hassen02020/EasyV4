/**
 * Tests purs pour lib/booking/policy-engine.ts — buildPolicySnapshot() et
 * evaluateCancellation() ne font aucune I/O, testables directement.
 * resolveCancellationPolicy() (I/O DB) est testée séparément en mode DB
 * réel (voir lib/booking/__tests__/policy-engine-db.test.ts).
 */

import { strict as assert } from "node:assert"
import { test } from "node:test"
import { buildPolicySnapshot, evaluateCancellation, type ResolvedPolicy } from "../policy-engine"

function makePolicy(overrides: Partial<ResolvedPolicy> = {}): ResolvedPolicy {
  return {
    id: "policy-1",
    agencyId: "agency-1",
    productType: "omra",
    productId: null,
    version: 1,
    cancellable: true,
    modifiable: false,
    deadlineHours: null,
    cancellationFeePercent: null,
    refundAllowed: true,
    creditAllowed: true,
    nonRefundable: false,
    requiresValidatedDocument: false,
    postDeadlineDescription: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

test("buildPolicySnapshot : aucune politique → policy null, jamais un objet fabriqué", () => {
  const snap = buildPolicySnapshot(null, false)
  assert.equal(snap.policy, null)
  assert.equal(snap.acceptedByCustomer, false)
  assert.ok(snap.resolvedAt)
})

test("buildPolicySnapshot : politique réelle → figée telle quelle avec l'acceptation client", () => {
  const policy = makePolicy()
  const snap = buildPolicySnapshot(policy, true)
  assert.deepEqual(snap.policy, policy)
  assert.equal(snap.acceptedByCustomer, true)
})

test("evaluateCancellation : snapshot null (jamais résolu) → non autorisé, aucun montant calculé", () => {
  const outcome = evaluateCancellation(null, 1000)
  assert.equal(outcome.allowed, false)
  assert.equal(outcome.creditableTnd, null)
  assert.equal(outcome.feePercent, null)
})

test("evaluateCancellation : politique non définie au moment de la réservation → non autorisé", () => {
  const snap = buildPolicySnapshot(null, false)
  const outcome = evaluateCancellation(snap, 1000)
  assert.equal(outcome.allowed, false)
  assert.ok(outcome.reason?.includes("Aucune politique"))
})

test("evaluateCancellation : cancellable=false → refusé explicitement", () => {
  const snap = buildPolicySnapshot(makePolicy({ cancellable: false }), true)
  const outcome = evaluateCancellation(snap, 1000)
  assert.equal(outcome.allowed, false)
  assert.ok(outcome.reason?.includes("pas annulable"))
})

test("evaluateCancellation : nonRefundable=true → refusé même si cancellable=true", () => {
  const snap = buildPolicySnapshot(makePolicy({ cancellable: true, nonRefundable: true }), true)
  const outcome = evaluateCancellation(snap, 1000)
  assert.equal(outcome.allowed, false)
  assert.ok(outcome.reason?.includes("non remboursable"))
})

test("evaluateCancellation : aucun frais configuré (null) → crédit intégral, jamais un pourcentage inventé", () => {
  const snap = buildPolicySnapshot(makePolicy({ cancellationFeePercent: null }), true)
  const outcome = evaluateCancellation(snap, 1000)
  assert.equal(outcome.allowed, true)
  assert.equal(outcome.creditableTnd, 1000)
  assert.equal(outcome.feePercent, null)
})

test("evaluateCancellation : frais explicitement configuré à 20% → crédit réduit en conséquence", () => {
  const snap = buildPolicySnapshot(makePolicy({ cancellationFeePercent: 20 }), true)
  const outcome = evaluateCancellation(snap, 1000)
  assert.equal(outcome.allowed, true)
  assert.equal(outcome.creditableTnd, 800)
  assert.equal(outcome.feePercent, 20)
})

test("evaluateCancellation : frais explicitement configuré à 0 (distinct de null) → crédit intégral, calcul honnête", () => {
  const snap = buildPolicySnapshot(makePolicy({ cancellationFeePercent: 0 }), true)
  const outcome = evaluateCancellation(snap, 1000)
  assert.equal(outcome.allowed, true)
  assert.equal(outcome.creditableTnd, 1000)
  assert.equal(outcome.feePercent, 0)
})

test("evaluateCancellation : ni remboursement ni crédit autorisés → annulation acceptée mais montant 0", () => {
  const snap = buildPolicySnapshot(makePolicy({ refundAllowed: false, creditAllowed: false }), true)
  const outcome = evaluateCancellation(snap, 1000)
  assert.equal(outcome.allowed, true)
  assert.equal(outcome.creditableTnd, 0)
})

test("evaluateCancellation : frais 100% → crédit jamais négatif", () => {
  const snap = buildPolicySnapshot(makePolicy({ cancellationFeePercent: 100 }), true)
  const outcome = evaluateCancellation(snap, 1000)
  assert.equal(outcome.creditableTnd, 0)
})
