import test from "node:test"
import assert from "node:assert/strict"
import { computeWhatsAppSignature, verifyWhatsAppSignature } from "../signing"

const SECRET = "test-app-secret"
const PAYLOAD = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [] }))

test("verifyWhatsAppSignature : signature correctement calculée → true", () => {
  const sig = `sha256=${computeWhatsAppSignature(PAYLOAD, SECRET)}`
  assert.equal(verifyWhatsAppSignature(PAYLOAD, sig, SECRET), true)
})

test("verifyWhatsAppSignature : mauvais secret → false", () => {
  const sig = `sha256=${computeWhatsAppSignature(PAYLOAD, "wrong-secret")}`
  assert.equal(verifyWhatsAppSignature(PAYLOAD, sig, SECRET), false)
})

test("verifyWhatsAppSignature : payload modifié après signature (rejeu) → false", () => {
  const sig = `sha256=${computeWhatsAppSignature(PAYLOAD, SECRET)}`
  const tampered = Buffer.from(PAYLOAD.toString("utf8") + "x")
  assert.equal(verifyWhatsAppSignature(tampered, sig, SECRET), false)
})

test("verifyWhatsAppSignature : header absent → false, jamais une exception", () => {
  assert.equal(verifyWhatsAppSignature(PAYLOAD, null, SECRET), false)
})

test("verifyWhatsAppSignature : schéma inattendu (pas 'sha256=') → false", () => {
  assert.equal(verifyWhatsAppSignature(PAYLOAD, "sha1=abcd", SECRET), false)
})

test("verifyWhatsAppSignature : hex malformé → false, jamais une exception", () => {
  assert.equal(verifyWhatsAppSignature(PAYLOAD, "sha256=not-hex-!!", SECRET), false)
})
