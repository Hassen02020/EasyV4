/**
 * CONTACT-01 — tests unitaires de normalizePhoneRefCore et
 * resolveContactKeyCore (fonctions pures, aucun accès DB requis).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { normalizePhoneRefCore, resolveContactKeyCore } from "../contact-core"

test("normalizePhoneRefCore : +216 déjà présent → inchangé", () => {
  assert.equal(normalizePhoneRefCore("+21620000001"), "+21620000001")
})

test("normalizePhoneRefCore : 216 sans + → canonique +216...", () => {
  assert.equal(normalizePhoneRefCore("21620000001"), "+21620000001")
})

test("normalizePhoneRefCore : préfixe international 00216 → canonique +216...", () => {
  assert.equal(normalizePhoneRefCore("0021620000001"), "+21620000001")
})

test("normalizePhoneRefCore : 8 chiffres locaux → canonique +216...", () => {
  assert.equal(normalizePhoneRefCore("20000001"), "+21620000001")
})

test("normalizePhoneRefCore : espaces/tirets/parenthèses retirés avant reconnaissance", () => {
  assert.equal(normalizePhoneRefCore("+216 20 000 001"), "+21620000001")
  assert.equal(normalizePhoneRefCore("20-000-001"), "+21620000001")
  assert.equal(normalizePhoneRefCore("(216) 20000001"), "+21620000001")
})

test("normalizePhoneRefCore : numéro hors format reconnu → renvoyé tel quel, JAMAIS fabriqué", () => {
  assert.equal(normalizePhoneRefCore("+33612345678"), "+33612345678")
  assert.equal(normalizePhoneRefCore("12345"), "12345")
})

test("resolveContactKeyCore : channel email → délègue à normalizeContactRef (minuscules+trim)", () => {
  assert.equal(
    resolveContactKeyCore("email", "Test@Example.COM"),
    "test@example.com",
  )
})

test("resolveContactKeyCore : channel whatsapp/call → normalizePhoneRefCore", () => {
  assert.equal(resolveContactKeyCore("whatsapp", "20000001"), "+21620000001")
  assert.equal(resolveContactKeyCore("call", "20000001"), "+21620000001")
})

test("resolveContactKeyCore : channel instagram/messenger/web → trim seul, jamais de normalisation fabriquée", () => {
  assert.equal(resolveContactKeyCore("instagram", "  @handle  "), "@handle")
  assert.equal(resolveContactKeyCore("messenger", "  abc123  "), "abc123")
  assert.equal(
    resolveContactKeyCore("web", "  anon-session-1  "),
    "anon-session-1",
  )
})
