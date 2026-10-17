/**
 * INNGEST-HANDLER-WIRING-03/packages — invariants statiques sur le câblage
 * du sendEvent de confirmation pour les réservations Package B2C.
 *
 * Invariants protégés :
 *
 * 1. sendEvent "booking/package.confirmed" câblé et conditionné sur
 *    result.status === "confirmed" && email disponible.
 * 2. payload complet : publicRef, agencyId, packageName, departureDate,
 *    paxCount, totalTnd, contactEmail.
 * 3. .catch() présent — échec Inngest ne doit JAMAIS annuler la réservation.
 * 4. packageName et totalTnd transitent depuis le retour de transaction
 *    (résolution serveur, jamais fournie par le client).
 *
 * Pattern readFileSync : "use server" empêche l'import direct sous node --test.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/packages/booking-actions.ts"), "utf8")

// ─── 1. sendEvent câblé ───────────────────────────────────────────────────
test("PKG-WIRING-01 : sendEvent importé depuis @/lib/inngest/client", () => {
  assert.match(src, /import.*sendEvent.*from.*@\/lib\/inngest\/client/)
})

test("PKG-WIRING-02 : sendEvent booking/package.confirmed câblé", () => {
  assert.match(src, /sendEvent\("booking\/package\.confirmed"/)
})

test("PKG-WIRING-03 : sendEvent déclenché si status confirmed et email", () => {
  assert.match(
    src,
    /result\.status\s*===\s*["']confirmed["'][\s\S]*booking\.traveler\.email/,
    "guard status confirmed + email requis avant sendEvent",
  )
})

// ─── 2. .catch() présent ─────────────────────────────────────────────────
test("PKG-WIRING-04 : sendEvent protégé par .catch() (réservation non annulée si Inngest indisponible)", () => {
  assert.match(
    src,
    /sendEvent\("booking\/package\.confirmed"[\s\S]*?\)\.catch\(/,
  )
})

// ─── 3. payload complet ───────────────────────────────────────────────────
test("PKG-WIRING-05 : payload contient publicRef depuis result", () => {
  assert.match(src, /publicRef:\s*result\.publicRef/)
})

test("PKG-WIRING-06 : payload contient agencyId", () => {
  assert.match(src, /agencyId,/)
})

test("PKG-WIRING-07 : payload contient packageName depuis result (résolution serveur)", () => {
  assert.match(src, /packageName:\s*result\.packageName/)
})

test("PKG-WIRING-08 : payload contient departureDate depuis result", () => {
  assert.match(src, /departureDate:\s*result\.departureDate/)
})

test("PKG-WIRING-09 : payload contient paxCount", () => {
  assert.match(src, /paxCount,/)
})

test("PKG-WIRING-10 : payload contient totalTnd depuis result", () => {
  assert.match(src, /totalTnd:\s*result\.totalTnd/)
})

test("PKG-WIRING-11 : payload contient contactEmail depuis booking.traveler.email", () => {
  assert.match(src, /contactEmail:\s*booking\.traveler\.email/)
})

// ─── 4. champs exposés depuis la transaction ──────────────────────────────
test("PKG-WIRING-12 : packageName retourné depuis la transaction (pkg.title)", () => {
  assert.match(src, /packageName:\s*pkg\.title/)
})

test("PKG-WIRING-13 : departureDate retourné depuis la transaction (departure.departureDate)", () => {
  assert.match(src, /departureDate:\s*departure\.departureDate/)
})
