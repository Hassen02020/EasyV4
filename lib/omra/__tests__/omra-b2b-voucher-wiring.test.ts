/**
 * OMRA-B2B-VOUCHER-01 — invariants statiques sur le câblage du voucher de
 * confirmation pour les réservations Omra B2B (booking-actions.ts).
 *
 * Invariants protégés :
 *
 * 1. sendEvent "booking/omra.confirmed" est câblé et conditionné sur un
 *    email de contact disponible (result.contactEmail).
 *
 * 2. Le payload contient les champs requis par le handler Inngest
 *    (process-omra-confirmed.ts) : reservationId, publicRef, agencyId,
 *    packageName, pilgrimsCount, departureDate, totalTnd, contactEmail.
 *
 * 3. La protection .catch() est présente — l'échec Inngest ne doit JAMAIS
 *    annuler la réservation déjà enregistrée.
 *
 * 4. Les champs resolvent depuis `result` (retour de transaction interne).
 *
 * Pattern readFileSync (même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(join(ROOT, "lib/omra/booking-actions.ts"), "utf8")

// ─── Invariant 1 : sendEvent câblé ────────────────────────────────────────

test("OMRA-B2B-VOUCHER-01 : sendEvent importé depuis @/lib/inngest/client", () => {
  assert.match(src, /import.*sendEvent.*from.*@\/lib\/inngest\/client/)
})

test("OMRA-B2B-VOUCHER-01 : sendEvent booking/omra.confirmed câblé", () => {
  assert.match(src, /sendEvent\("booking\/omra\.confirmed"/)
})

test("OMRA-B2B-VOUCHER-01 : sendEvent déclenché conditionnellement (contactEmail)", () => {
  assert.match(src, /if\s*\(result\.contactEmail\)/)
})

// ─── Invariant 2 : protection .catch() ────────────────────────────────────

test("OMRA-B2B-VOUCHER-01 : sendEvent protégé par .catch() (booking non annulé si Inngest indisponible)", () => {
  assert.match(src, /sendEvent\("booking\/omra\.confirmed"[\s\S]*?\)\.catch\(/)
})

// ─── Invariant 3 : payload complet depuis result ──────────────────────────

test("OMRA-B2B-VOUCHER-01 : payload contient reservationId depuis result", () => {
  assert.match(src, /reservationId:\s*result\.reservationId/)
})

test("OMRA-B2B-VOUCHER-01 : payload contient publicRef depuis result", () => {
  assert.match(src, /publicRef:\s*result\.publicRef/)
})

test("OMRA-B2B-VOUCHER-01 : payload contient agencyId depuis result (résolution serveur)", () => {
  assert.match(src, /agencyId:\s*result\.agencyId/)
})

test("OMRA-B2B-VOUCHER-01 : payload contient packageName depuis result", () => {
  assert.match(src, /packageName:\s*result\.packageName/)
})

test("OMRA-B2B-VOUCHER-01 : payload contient pilgrimsCount depuis result", () => {
  assert.match(src, /pilgrimsCount:\s*result\.pilgrimsCount/)
})

test("OMRA-B2B-VOUCHER-01 : payload contient departureDate depuis input", () => {
  assert.match(src, /departureDate:\s*input\.departureDate/)
})

test("OMRA-B2B-VOUCHER-01 : payload contient totalTnd depuis result", () => {
  assert.match(src, /totalTnd:\s*result\.totalTnd/)
})

test("OMRA-B2B-VOUCHER-01 : payload contient contactEmail depuis result", () => {
  assert.match(src, /contactEmail:\s*result\.contactEmail/)
})
