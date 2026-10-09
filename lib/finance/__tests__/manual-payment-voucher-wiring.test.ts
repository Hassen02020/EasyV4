/**
 * VOUCHER-WIRING-01/manual-payment — invariants statiques sur la voie
 * secondaire d'envoi du voucher hôtel dans manual-payment-actions.ts.
 *
 * Contexte : quand un paiement hôtel (module "hotel") est confirmé via
 * Paymee webhook, confirmPaymentOutcome() envoie "booking/confirmed" pour
 * déclencher le handler de génération PDF/email. C'est une voie distincte
 * de lib/hotels-monde/guest-booking-actions.ts.
 *
 * Invariants protégés :
 *
 * 1. GARDE MODULE — envoi conditionné sur detail?.module === "hotel" &&
 *    detail.customerEmail && detail.hotelName.
 *
 * 2. CONVERSION totalTnd — Number.parseFloat(detail.tndAmount) depuis la
 *    colonne DB tndAmount (string) — jamais detail.totalTnd (inexistant).
 *
 * 3. customerName assemblé depuis customerFirstName + customerLastName (DB),
 *    jamais un champ customerName unique.
 *
 * 4. FIRE-AND-FORGET — .catch() après sendEvent pour ne pas bloquer la
 *    confirmation de paiement.
 *
 * 5. Envoie bien sendEvent("booking/confirmed", ...) — pas inngest.send.
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/finance/manual-payment-actions.ts"),
  "utf8",
)

// ─── Invariant 1 : garde module hotel + customerEmail + hotelName ─────────

test("VOUCHER-WIRING-01/manual-payment : garde detail?.module === \"hotel\"", () => {
  assert.match(src, /detail\?\.module\s*===\s*["']hotel["']/)
})

test("VOUCHER-WIRING-01/manual-payment : garde detail.customerEmail avant sendEvent", () => {
  assert.match(src, /detail\.customerEmail/)
})

test("VOUCHER-WIRING-01/manual-payment : garde detail.hotelName avant sendEvent", () => {
  assert.match(src, /detail\.hotelName/)
})

// ─── Invariant 2 : totalTnd = Number.parseFloat(detail.tndAmount) ─────────

test("VOUCHER-WIRING-01/manual-payment : totalTnd converti depuis detail.tndAmount (string DB)", () => {
  assert.match(src, /totalTnd:\s*Number\.parseFloat\(detail\.tndAmount\)/)
})

test("VOUCHER-WIRING-01/manual-payment : lit tndAmount depuis la DB (pas detail.totalTnd)", () => {
  assert.match(src, /tndAmount:\s*reservations\.tndAmount/)
  assert.doesNotMatch(src, /totalTnd:\s*detail\.totalTnd/)
})

// ─── Invariant 3 : customerName assemblé depuis first+last name ───────────

test("VOUCHER-WIRING-01/manual-payment : customerName assemblé via customerFirstName + customerLastName", () => {
  assert.match(src, /customerName:\s*`\$\{detail\.customerFirstName\}\s*\$\{detail\.customerLastName\}`\.trim\(\)/)
})

// ─── Invariant 4 : fire-and-forget ────────────────────────────────────────

test("VOUCHER-WIRING-01/manual-payment : sendEvent «booking/confirmed» est fire-and-forget (.catch)", () => {
  assert.match(src, /sendEvent\(["']booking\/confirmed["'][\s\S]{0,800}?\)\.catch\(/)
})

// ─── Invariant 5 : utilise sendEvent (pas inngest.send direct) ────────────

test("VOUCHER-WIRING-01/manual-payment : utilise sendEvent (helper typé) pour booking/confirmed", () => {
  assert.match(src, /import.*sendEvent.*from.*inngest\/client/)
  assert.match(src, /await sendEvent\(["']booking\/confirmed["']/)
})

// ─── Invariant 6 : champs payload complets ────────────────────────────────

test("VOUCHER-WIRING-01/manual-payment : payload contient reservationId, publicRef, agencyId, guestAccessToken", () => {
  const idx = src.indexOf('sendEvent("booking/confirmed"')
  const block = src.slice(idx, idx + 600)
  assert.match(block, /reservationId/)
  assert.match(block, /publicRef/)
  assert.match(block, /agencyId/)
  assert.match(block, /guestAccessToken/)
})

test("VOUCHER-WIRING-01/manual-payment : payload contient hotelName, checkIn, checkOut, nights, adults, children", () => {
  const idx = src.indexOf('sendEvent("booking/confirmed"')
  const block = src.slice(idx, idx + 600)
  assert.match(block, /hotelName/)
  assert.match(block, /checkIn/)
  assert.match(block, /checkOut/)
  assert.match(block, /nights/)
  assert.match(block, /adults/)
  assert.match(block, /children/)
})
