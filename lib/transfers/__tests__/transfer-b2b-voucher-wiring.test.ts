/**
 * TRANSFER-B2B-VOUCHER-01 — invariants statiques sur le câblage du voucher
 * de confirmation pour les transferts B2B (actions.ts).
 *
 * Invariants protégés :
 *
 * 1. sendEvent "booking/transfer.confirmed" est câblé dans la branche B2B,
 *    identiquement à la branche B2C (lib/transfers/guest-booking-actions.ts).
 *
 * 2. sendEvent est fire-and-forget (.catch) — l'échec email/SMS ne doit
 *    JAMAIS annuler la réservation déjà enregistrée.
 *
 * 3. Condition déclenchement : email OU phone (le SMS chauffeur ne dépend
 *    que du phone — l'événement doit partir dès qu'on a l'un ou l'autre).
 *
 * 4. Le payload contient tous les champs essentiels, issus de outcome.result
 *    (résolution serveur, jamais depuis l'input non validé pour les IDs).
 *
 * Pattern readFileSync (même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/transfers/actions.ts"), "utf8")

// ─── Invariant 1 : sendEvent câblé ────────────────────────────────────────

test("TRANSFER-B2B-VOUCHER-01 : sendEvent importé depuis @/lib/inngest/client", () => {
  assert.match(src, /import.*sendEvent.*from.*@\/lib\/inngest\/client/)
})

test("TRANSFER-B2B-VOUCHER-01 : sendEvent booking/transfer.confirmed câblé pour transferts B2B", () => {
  assert.match(src, /sendEvent\("booking\/transfer\.confirmed"/)
})

// ─── Invariant 2 : fire-and-forget ────────────────────────────────────────

test("TRANSFER-B2B-VOUCHER-01 : sendEvent fire-and-forget (pas d'await bloquant)", () => {
  assert.match(src, /sendEvent\("booking\/transfer\.confirmed"[\s\S]*?\)\.catch\(/)
})

test("TRANSFER-B2B-VOUCHER-01 : sendEvent déclenché conditionnellement (email ou phone)", () => {
  assert.match(
    src,
    /if\s*\(input\.customer\.email\s*\|\|\s*input\.customer\.phone\)/,
  )
})

// ─── Invariant 3 : payload complet depuis outcome.result ──────────────────

test("TRANSFER-B2B-VOUCHER-01 : payload contient reservationId depuis outcome.result", () => {
  assert.match(src, /reservationId:\s*outcome\.result\.reservationId/)
})

test("TRANSFER-B2B-VOUCHER-01 : payload contient publicRef depuis outcome.result", () => {
  assert.match(src, /publicRef:\s*outcome\.result\.publicRef/)
})

test("TRANSFER-B2B-VOUCHER-01 : payload contient agencyId depuis outcome.result (résolution serveur)", () => {
  assert.match(src, /agencyId:\s*outcome\.result\.agencyId/)
})

test("TRANSFER-B2B-VOUCHER-01 : payload contient customerEmail", () => {
  assert.match(src, /customerEmail:\s*input\.customer\.email\s*\?\?\s*""/)
})

test("TRANSFER-B2B-VOUCHER-01 : payload contient customerPhone", () => {
  assert.match(src, /customerPhone:\s*input\.customer\.phone/)
})

test("TRANSFER-B2B-VOUCHER-01 : payload contient fromZone depuis outcome.result.fromZoneName", () => {
  assert.match(src, /fromZone:\s*outcome\.result\.fromZoneName/)
})

test("TRANSFER-B2B-VOUCHER-01 : payload contient toZone depuis outcome.result.toZoneName", () => {
  assert.match(src, /toZone:\s*outcome\.result\.toZoneName/)
})

test("TRANSFER-B2B-VOUCHER-01 : payload contient vehicleType depuis input", () => {
  assert.match(src, /vehicleType:\s*input\.vehicleType/)
})

test("TRANSFER-B2B-VOUCHER-01 : payload contient pickupAt construit depuis pickupDate + pickupTime", () => {
  assert.match(
    src,
    /pickupAt:\s*`\$\{input\.pickupDate\}T\$\{input\.pickupTime\}:00`/,
  )
})

test("TRANSFER-B2B-VOUCHER-01 : payload contient totalTnd depuis outcome.result", () => {
  assert.match(src, /totalTnd:\s*outcome\.result\.totalTnd/)
})
