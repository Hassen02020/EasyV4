/**
 * CONSENT-01 — tests unitaires de resolveConsentStatusCore, fonction pure
 * (aucun accès DB requis), et normalizeContactRef.
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveConsentStatusCore,
  normalizeContactRef,
  type ConsentEventRow,
} from "../consent-core"

function event(over: Partial<ConsentEventRow> = {}): ConsentEventRow {
  return {
    id: "evt-1",
    agencyId: "agency-a",
    channel: "email",
    contactRef: "test@example.com",
    purpose: "marketing",
    action: "granted",
    occurredAt: new Date("2026-10-01T00:00:00Z"),
    source: "lead_capture_form_checkbox",
    proofRef: null,
    recordedByUserId: null,
    ...over,
  }
}

test("absence totale d'événement → false (jamais une présomption d'accord)", () => {
  assert.equal(resolveConsentStatusCore([]), false)
})

test("un seul événement 'granted' → true", () => {
  assert.equal(resolveConsentStatusCore([event({ action: "granted" })]), true)
})

test("un seul événement 'withdrawn' → false", () => {
  assert.equal(
    resolveConsentStatusCore([event({ action: "withdrawn" })]),
    false,
  )
})

test("granted puis withdrawn (ordre chronologique) → false, le dernier événement fait foi", () => {
  const events = [
    event({ action: "granted", occurredAt: new Date("2026-10-01T00:00:00Z") }),
    event({
      action: "withdrawn",
      occurredAt: new Date("2026-10-05T00:00:00Z"),
    }),
  ]
  assert.equal(resolveConsentStatusCore(events), false)
})

test("granted → withdrawn → nouvel granted → true (pas un conflit, une séquence valide)", () => {
  const events = [
    event({ action: "granted", occurredAt: new Date("2026-10-01T00:00:00Z") }),
    event({
      action: "withdrawn",
      occurredAt: new Date("2026-10-05T00:00:00Z"),
    }),
    event({ action: "granted", occurredAt: new Date("2026-10-10T00:00:00Z") }),
  ]
  assert.equal(resolveConsentStatusCore(events), true)
})

test("ordre d'INSERTION différent de l'ordre chronologique → résultat identique (dernier par occurredAt, jamais par position dans le tableau)", () => {
  const granted = event({
    action: "granted",
    occurredAt: new Date("2026-10-10T00:00:00Z"),
  })
  const withdrawn = event({
    action: "withdrawn",
    occurredAt: new Date("2026-10-01T00:00:00Z"),
  })
  // Le "withdrawn" est plus ANCIEN mais placé en PREMIER dans le tableau —
  // le résultat doit rester "true" (granted est le plus RÉCENT).
  const orderA = resolveConsentStatusCore([withdrawn, granted])
  const orderB = resolveConsentStatusCore([granted, withdrawn])
  assert.equal(orderA, true)
  assert.equal(orderB, true)
})

test("idempotent et déterministe — même entrée rejouée produit le même résultat", () => {
  const events = [
    event({ action: "granted", occurredAt: new Date("2026-10-01T00:00:00Z") }),
    event({
      action: "withdrawn",
      occurredAt: new Date("2026-10-05T00:00:00Z"),
    }),
  ]
  const r1 = resolveConsentStatusCore(events)
  const r2 = resolveConsentStatusCore(events)
  const r3 = resolveConsentStatusCore([...events])
  assert.equal(r1, r2)
  assert.equal(r1, r3)
})

test("normalizeContactRef : email mis en minuscules", () => {
  assert.equal(normalizeContactRef("Test@Example.COM"), "test@example.com")
})

test("normalizeContactRef : email avec espaces trim", () => {
  assert.equal(normalizeContactRef("  test@example.com  "), "test@example.com")
})

test("normalizeContactRef : téléphone laissé tel quel (pas d'email, juste trim)", () => {
  assert.equal(normalizeContactRef("  +21620000001  "), "+21620000001")
})
