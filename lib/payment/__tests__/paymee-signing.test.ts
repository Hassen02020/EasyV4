/**
 * Tests unitaires — `lib/payment/paymee-signing.ts`.
 *
 * Couvre : signature valide/invalide, statut manquant/imprévu (échec fermé,
 * jamais un statut deviné), protection contre le rejeu (même check_sum sur
 * un payload modifié -> rejeté). Voir l'avertissement de fichier dans
 * paymee-signing.ts : la formule elle-même n'a pas pu être vérifiée contre
 * la doc primaire Paymee (réseau bloqué) — ces tests valident le
 * COMPORTEMENT du vérificateur (échoue fermé, timing-safe, cohérent avec
 * lui-même), pas sa fidélité à un vrai payload Paymee.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { computePaymeeChecksum, verifyPaymeeChecksum, normalizePaymeeStatus } from "../paymee-signing"

test("normalizePaymeeStatus : booléen natif", () => {
  assert.equal(normalizePaymeeStatus(true), true)
  assert.equal(normalizePaymeeStatus(false), false)
})

test("normalizePaymeeStatus : chaînes 'True'/'False' façon Django, insensible à la casse", () => {
  assert.equal(normalizePaymeeStatus("True"), true)
  assert.equal(normalizePaymeeStatus("false"), false)
  assert.equal(normalizePaymeeStatus("FALSE"), false)
})

test("normalizePaymeeStatus : '1'/'0' et 1/0 numériques", () => {
  assert.equal(normalizePaymeeStatus("1"), true)
  assert.equal(normalizePaymeeStatus("0"), false)
  assert.equal(normalizePaymeeStatus(1), true)
  assert.equal(normalizePaymeeStatus(0), false)
})

test("normalizePaymeeStatus : valeur imprévue -> null, jamais deviné", () => {
  assert.equal(normalizePaymeeStatus("maybe"), null)
  assert.equal(normalizePaymeeStatus(null), null)
  assert.equal(normalizePaymeeStatus(undefined), null)
  assert.equal(normalizePaymeeStatus(2), null)
})

test("verifyPaymeeChecksum : check_sum correctement calculé -> true", () => {
  const token = "tok_abc123"
  const apiKey = "secret_key_1"
  const checkSum = computePaymeeChecksum({ token, paymentStatus: true, apiKey })
  assert.equal(
    verifyPaymeeChecksum({ token, paymentStatusRaw: true, checkSum, apiKey }),
    true,
  )
})

test("verifyPaymeeChecksum : mauvaise clé API -> false", () => {
  const token = "tok_abc123"
  const checkSum = computePaymeeChecksum({ token, paymentStatus: true, apiKey: "real_key" })
  assert.equal(
    verifyPaymeeChecksum({ token, paymentStatusRaw: true, checkSum, apiKey: "wrong_key" }),
    false,
  )
})

test("verifyPaymeeChecksum : payload modifié après signature (payment_status changé) -> false", () => {
  const token = "tok_abc123"
  const apiKey = "secret_key_1"
  const checkSum = computePaymeeChecksum({ token, paymentStatus: true, apiKey })
  // Le check_sum a été calculé pour payment_status=true — un attaquant qui
  // rejoue le même check_sum en changeant le statut à false doit échouer.
  assert.equal(
    verifyPaymeeChecksum({ token, paymentStatusRaw: false, checkSum, apiKey }),
    false,
  )
})

test("verifyPaymeeChecksum : token modifié après signature -> false", () => {
  const apiKey = "secret_key_1"
  const checkSum = computePaymeeChecksum({ token: "tok_original", paymentStatus: true, apiKey })
  assert.equal(
    verifyPaymeeChecksum({ token: "tok_different", paymentStatusRaw: true, checkSum, apiKey }),
    false,
  )
})

test("verifyPaymeeChecksum : check_sum absent -> false, jamais une exception", () => {
  assert.equal(
    verifyPaymeeChecksum({ token: "tok_abc", paymentStatusRaw: true, checkSum: null, apiKey: "k" }),
    false,
  )
  assert.equal(
    verifyPaymeeChecksum({ token: "tok_abc", paymentStatusRaw: true, checkSum: undefined, apiKey: "k" }),
    false,
  )
})

test("verifyPaymeeChecksum : payment_status imprévu -> échoue fermé (false), jamais un statut deviné", () => {
  assert.equal(
    verifyPaymeeChecksum({
      token: "tok_abc",
      paymentStatusRaw: "unparseable",
      checkSum: "deadbeef",
      apiKey: "k",
    }),
    false,
  )
})

test("verifyPaymeeChecksum : check_sum manifestement mal formé (longueur différente) -> false, jamais une exception", () => {
  assert.equal(
    verifyPaymeeChecksum({
      token: "tok_abc",
      paymentStatusRaw: true,
      checkSum: "short",
      apiKey: "k",
    }),
    false,
  )
})

test("verifyPaymeeChecksum : insensible à la casse hexadécimale du check_sum reçu", () => {
  const token = "tok_case"
  const apiKey = "k"
  const checkSum = computePaymeeChecksum({ token, paymentStatus: false, apiKey })
  assert.equal(
    verifyPaymeeChecksum({ token, paymentStatusRaw: false, checkSum: checkSum.toUpperCase(), apiKey }),
    true,
  )
})
