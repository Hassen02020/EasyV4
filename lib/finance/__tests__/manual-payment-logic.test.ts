import test from "node:test"
import assert from "node:assert/strict"

import {
  MANUAL_PAYMENT_ALLOWED_ROLES,
  toPaymentMethod,
  computeCaptureKind,
  isPastPaymentDeadline,
} from "../manual-payment-logic"

test("MANUAL_PAYMENT_ALLOWED_ROLES exclut agent_excursions et les rôles partenaire B2B", () => {
  assert.deepEqual([...MANUAL_PAYMENT_ALLOWED_ROLES].sort(), [
    "agent_compta",
    "agent_resa",
    "manager",
    "super_admin",
  ])
  assert.equal((MANUAL_PAYMENT_ALLOWED_ROLES as readonly string[]).includes("agent_excursions"), false)
  assert.equal((MANUAL_PAYMENT_ALLOWED_ROLES as readonly string[]).includes("partner_owner"), false)
  assert.equal((MANUAL_PAYMENT_ALLOWED_ROLES as readonly string[]).includes("partner_agent"), false)
})

test("toPaymentMethod : cash reste cash", () => {
  assert.equal(toPaymentMethod("cash"), "cash")
})

test("toPaymentMethod : transfer, deposit et mandate mappent tous sur transfer (pas de nouvel enum)", () => {
  assert.equal(toPaymentMethod("transfer"), "transfer")
  assert.equal(toPaymentMethod("deposit"), "transfer")
  assert.equal(toPaymentMethod("mandate"), "transfer")
})

test("toPaymentMethod : wallet et at_hotel gardent leur propre valeur d'enum", () => {
  assert.equal(toPaymentMethod("wallet"), "wallet")
  assert.equal(toPaymentMethod("at_hotel"), "at_hotel")
})

test("computeCaptureKind : 'deposit' (acompte) quand du solde reste après la capture", () => {
  assert.equal(computeCaptureKind(700, 0.005), "deposit")
  assert.equal(computeCaptureKind(0.01, 0.005), "deposit")
})

test("computeCaptureKind : 'balance' (solde) quand la capture épuise le restant", () => {
  assert.equal(computeCaptureKind(0, 0.005), "balance")
  assert.equal(computeCaptureKind(0.001, 0.005), "balance") // sous la tolérance flottante
})

test("isPastPaymentDeadline : false si aucune deadline posée (pas de fenêtre — ex. carte)", () => {
  assert.equal(isPastPaymentDeadline(null), false)
})

test("isPastPaymentDeadline : false avant la deadline", () => {
  const now = new Date("2026-01-01T12:00:00Z")
  const deadline = new Date("2026-01-02T12:00:00Z")
  assert.equal(isPastPaymentDeadline(deadline, now), false)
})

test("isPastPaymentDeadline : true après la deadline (24h dépassées)", () => {
  const now = new Date("2026-01-03T12:00:01Z")
  const deadline = new Date("2026-01-02T12:00:00Z")
  assert.equal(isPastPaymentDeadline(deadline, now), true)
})

test("isPastPaymentDeadline : true exactement à la deadline n'est pas considéré dépassé (strictement supérieur)", () => {
  const now = new Date("2026-01-02T12:00:00Z")
  const deadline = new Date("2026-01-02T12:00:00Z")
  assert.equal(isPastPaymentDeadline(deadline, now), false)
})
