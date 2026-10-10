/**
 * VOUCHER-WIRING-01/mygo-hotel — invariants statiques sur l'envoi
 * "booking/confirmed" depuis les deux chemins de réservation hôtel myGo :
 *   - lib/booking/actions.ts     (B2B pro — validation paiement débit wallet)
 *   - lib/booking/guest-actions.ts (B2C guest — paiement immédiat Paymee)
 *
 * Invariants protégés :
 *
 * ACTIONS.TS (B2B) :
 * 1. Guard draft.module === "hotel" && traveler.email — pas d'envoi pour
 *    les autres modules (omra/transfert/voiture) ni sans email.
 * 2. Fire-and-forget .catch() — ne bloque pas la confirmation de réservation.
 * 3. totalTnd depuis breakdown.totalTnd (number directement, pas de conversion).
 * 4. hotelName = myGoBooking?.hotelName ?? draft.offerLabel (fallback label).
 * 5. customerName = firstName + lastName .trim().
 *
 * GUEST-ACTIONS.TS (B2C) :
 * 6. SÉCURITÉ — Guard result.isImmediatelyPaid && traveler.email.
 *    Jamais "booking/confirmed" pour une réservation pending non payée
 *    (transfert cash, virement) — enverrait un vrai voucher pour une résa
 *    non encaissée.
 * 7. Fire-and-forget .catch() — ne bloque pas la confirmation B2C.
 * 8. totalTnd depuis breakdown.totalTnd (number directement).
 * 9. hotelName = myGoBooking.hotelName ?? draft.offerLabel.
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const actionsSrc = readFileSync(join(ROOT, "lib/booking/actions.ts"), "utf8")
const guestSrc = readFileSync(
  join(ROOT, "lib/booking/guest-actions.ts"),
  "utf8",
)

// ─── ACTIONS.TS (B2B) : Invariant 1 : garde module hotel + email ──────────

test('VOUCHER-WIRING-01/mygo-b2b : garde draft.module === "hotel" && traveler.email', () => {
  assert.match(
    actionsSrc,
    /draft\.module\s*===\s*["']hotel["']\s*&&\s*traveler\.email/,
  )
})

// ─── ACTIONS.TS (B2B) : Invariant 2 : fire-and-forget ────────────────────

test("VOUCHER-WIRING-01/mygo-b2b : sendEvent booking/confirmed est fire-and-forget (.catch)", () => {
  assert.match(
    actionsSrc,
    /sendEvent\(["']booking\/confirmed["'][\s\S]{0,800}?\)\.catch\(/,
  )
})

// ─── ACTIONS.TS (B2B) : Invariant 3 : totalTnd depuis breakdown ───────────

test("VOUCHER-WIRING-01/mygo-b2b : totalTnd depuis breakdown.totalTnd (pas de conversion string)", () => {
  const idx = actionsSrc.indexOf('sendEvent("booking/confirmed"')
  const block = actionsSrc.slice(idx, idx + 750)
  assert.match(block, /totalTnd:\s*breakdown\.totalTnd/)
})

// ─── ACTIONS.TS (B2B) : Invariant 4 : hotelName avec fallback ────────────

test("VOUCHER-WIRING-01/mygo-b2b : hotelName = myGoBooking?.hotelName ?? draft.offerLabel", () => {
  assert.match(
    actionsSrc,
    /hotelName:\s*myGoBooking\?\.hotelName\s*\?\?\s*draft\.offerLabel/,
  )
})

// ─── ACTIONS.TS (B2B) : Invariant 5 : customerName assemblé ─────────────

test("VOUCHER-WIRING-01/mygo-b2b : customerName assemblé via traveler.firstName + traveler.lastName", () => {
  const idx = actionsSrc.indexOf('sendEvent("booking/confirmed"')
  const block = actionsSrc.slice(idx, idx + 500)
  assert.match(
    block,
    /customerName:\s*`\$\{traveler\.firstName\}\s*\$\{traveler\.lastName\}`\.trim\(\)/,
  )
})

// ─── GUEST-ACTIONS.TS (B2C) : Invariant 6 : SÉCURITÉ isImmediatelyPaid ───

test("VOUCHER-WIRING-01/mygo-b2c : SÉCURITÉ — guard result.isImmediatelyPaid avant sendEvent booking/confirmed", () => {
  assert.match(guestSrc, /result\.isImmediatelyPaid\s*&&\s*traveler\.email/)
})

test("VOUCHER-WIRING-01/mygo-b2c : jamais de sendEvent booking/confirmed sans isImmediatelyPaid (pas de voucher pour résa pending)", () => {
  // La garde doit précéder le sendEvent — vérifier que le pattern est bien conditionnel
  const guardIdx = guestSrc.indexOf("result.isImmediatelyPaid")
  const sendEventIdx = guestSrc.indexOf('sendEvent("booking/confirmed"')
  assert.ok(
    guardIdx < sendEventIdx,
    "guard isImmediatelyPaid doit précéder sendEvent booking/confirmed",
  )
})

// ─── GUEST-ACTIONS.TS (B2C) : Invariant 7 : fire-and-forget ─────────────

test("VOUCHER-WIRING-01/mygo-b2c : sendEvent booking/confirmed est fire-and-forget (.catch)", () => {
  assert.match(
    guestSrc,
    /sendEvent\(["']booking\/confirmed["'][\s\S]{0,800}?\)\.catch\(/,
  )
})

// ─── GUEST-ACTIONS.TS (B2C) : Invariant 8 : totalTnd depuis breakdown ────

test("VOUCHER-WIRING-01/mygo-b2c : totalTnd depuis breakdown.totalTnd (pas de conversion string)", () => {
  const idx = guestSrc.indexOf('sendEvent("booking/confirmed"')
  const block = guestSrc.slice(idx, idx + 750)
  assert.match(block, /totalTnd:\s*breakdown\.totalTnd/)
})

// ─── GUEST-ACTIONS.TS (B2C) : Invariant 9 : hotelName avec fallback ──────

test("VOUCHER-WIRING-01/mygo-b2c : hotelName = myGoBooking.hotelName ?? draft.offerLabel", () => {
  assert.match(
    guestSrc,
    /hotelName:\s*myGoBooking\.hotelName\s*\?\?\s*draft\.offerLabel/,
  )
})
