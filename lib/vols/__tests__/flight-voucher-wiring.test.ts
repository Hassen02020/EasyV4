/**
 * VOUCHER-WIRING-01/flights — invariants statiques sur le câblage de l'envoi
 * Inngest "booking/flight.confirmed" depuis lib/vols/fulfillment-action.ts.
 *
 * Invariants protégés :
 *
 * 1. Utilise inngest.send (pas sendEvent helper) avec name "booking/flight.confirmed".
 *
 * 2. IDEMPOTENCE événement — clé `id: eventId` pour la déduplication Inngest.
 *
 * 3. PAYLOAD CHAMPS FINANCIERS — totalTnd = Number(snapshot.sellingAmount)
 *    depuis price_snapshots (colonne DB sellingAmount string → Number).
 *    Jamais un taux inventé ou une variable non liée à la DB.
 *
 * 4. Payload champs itinéraire — origin, destination, departureAt, carrier,
 *    flightNumber issus de firstSeg (premier segment du premier journey).
 *
 * 5. adults/children issus des fares itinerary (passengerType ADT/CHD).
 *
 * 6. customerEmail résolu depuis customers.email (DB), avec fallback si
 *    customerId.
 *
 * 7. Retry interne (INNGEST_MAX_ATTEMPTS) avec backoff exponentiel —
 *    jamais un crash silencieux.
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/vols/fulfillment-action.ts"), "utf8")

// ─── Invariant 1 : utilise inngest.send avec name correct ─────────────────

test('VOUCHER-WIRING-01/flights : inngest.send avec name "booking/flight.confirmed"', () => {
  assert.match(src, /name:\s*["']booking\/flight\.confirmed["']/)
})

// ─── Invariant 2 : clé id pour déduplication Inngest ─────────────────────

test("VOUCHER-WIRING-01/flights : clé id: eventId pour déduplication Inngest", () => {
  assert.match(src, /id:\s*eventId/)
  assert.match(src, /eventId\s*=\s*`flight\.confirmed:/)
})

// ─── Invariant 3 : totalTnd = Number(snapshot.sellingAmount) ─────────────

test("VOUCHER-WIRING-01/flights : totalTnd = Number(snapshot.sellingAmount) depuis DB", () => {
  assert.match(src, /totalTnd:\s*Number\(snapshot\.sellingAmount\)/)
})

test("VOUCHER-WIRING-01/flights : lit sellingAmount depuis la table price_snapshots ou snapshot DB", () => {
  assert.match(src, /sellingAmount/)
})

// ─── Invariant 4 : champs itinéraire depuis firstSeg ─────────────────────

test("VOUCHER-WIRING-01/flights : origin depuis firstSeg?.origin (premier segment)", () => {
  assert.match(src, /origin:\s*firstSeg\?\.origin/)
})

test("VOUCHER-WIRING-01/flights : destination depuis firstSeg?.destination", () => {
  assert.match(src, /destination:\s*firstSeg\?\.destination/)
})

test("VOUCHER-WIRING-01/flights : departureAt depuis firstSeg?.departure", () => {
  assert.match(src, /departureAt:\s*firstSeg\?\.departure/)
})

test("VOUCHER-WIRING-01/flights : carrier depuis firstSeg?.marketingCarrier", () => {
  assert.match(src, /carrier:\s*firstSeg\?\.marketingCarrier/)
})

test("VOUCHER-WIRING-01/flights : flightNumber depuis firstSeg?.marketingFlightNumber", () => {
  assert.match(src, /flightNumber:\s*firstSeg\?\.marketingFlightNumber/)
})

// ─── Invariant 5 : adults/children depuis fares itinerary ────────────────

test("VOUCHER-WIRING-01/flights : adults depuis fares[ADT].count", () => {
  assert.match(src, /passengerType.*["']ADT["']/)
})

test("VOUCHER-WIRING-01/flights : children depuis fares[CHD].count", () => {
  assert.match(src, /passengerType.*["']CHD["']/)
})

// ─── Invariant 6 : customerEmail depuis customers.email (DB) ─────────────

test("VOUCHER-WIRING-01/flights : customerEmail résolu depuis customers.email (DB)", () => {
  assert.match(src, /customers\.email/)
  assert.match(src, /customerEmail\s*=\s*contact\.email/)
})

// ─── Invariant 7 : retry interne avec backoff ─────────────────────────────

test("VOUCHER-WIRING-01/flights : retry interne avec INNGEST_MAX_ATTEMPTS et backoff exponentiel", () => {
  assert.match(src, /INNGEST_MAX_ATTEMPTS/)
  assert.match(src, /INNGEST_RETRY_BASE_MS/)
})

test("VOUCHER-WIRING-01/flights : log structuré INNGEST_DISPATCH_FAILURE si tous les retries épuisés", () => {
  assert.match(src, /INNGEST_DISPATCH_FAILURE/)
})
