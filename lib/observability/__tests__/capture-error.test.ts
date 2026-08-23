import test from "node:test"
import assert from "node:assert/strict"

import { captureError, scrubValue } from "../capture-error"

test("scrubValue : redacte les clés sensibles quelle que soit leur valeur", () => {
  assert.equal(scrubValue("accessToken", "abc123"), "[REDACTED]")
  assert.equal(scrubValue("password", "hunter2"), "[REDACTED]")
  assert.equal(scrubValue("SPS_SECRET_KEY", "xyz"), "[REDACTED]")
  assert.equal(scrubValue("apiKey", "xyz"), "[REDACTED]")
  assert.equal(scrubValue("Authorization", "Bearer xyz"), "[REDACTED]")
})

test("scrubValue : masque un numéro de téléphone en ne gardant que les 2 derniers chiffres", () => {
  const result = scrubValue("customerPhone", "+21698765432")
  assert.equal(typeof result, "string")
  assert.ok((result as string).startsWith("[PHONE_REDACTED:"))
  assert.ok((result as string).endsWith("32]"))
  assert.ok(!(result as string).includes("98765432"))
})

test("scrubValue : laisse passer une valeur non sensible inchangée", () => {
  assert.equal(scrubValue("reservationId", "r-123"), "r-123")
  assert.equal(scrubValue("operation", "manual-payment.verify"), "manual-payment.verify")
})

test("scrubValue : ne confond pas un UUID (non numérique) avec un téléphone", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000"
  assert.equal(scrubValue("reservationId", uuid), uuid)
})

test("captureError : ne lève jamais, même sans SENTRY_DSN configuré (comportement métier inchangé)", () => {
  const previous = process.env.SENTRY_DSN
  delete process.env.SENTRY_DSN
  try {
    assert.doesNotThrow(() => captureError(new Error("test"), { operation: "test" }))
  } finally {
    if (previous !== undefined) process.env.SENTRY_DSN = previous
  }
})

test("captureError : ne lève jamais pour une valeur d'erreur non-Error", () => {
  const previous = process.env.SENTRY_DSN
  delete process.env.SENTRY_DSN
  try {
    assert.doesNotThrow(() => captureError("just a string", undefined))
    assert.doesNotThrow(() => captureError(null, undefined))
  } finally {
    if (previous !== undefined) process.env.SENTRY_DSN = previous
  }
})
