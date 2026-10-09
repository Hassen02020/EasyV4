/**
 * OMRA-VOUCHER-01 — invariants statiques sur le câblage du voucher de
 * confirmation pour les réservations Omra B2C (guest-booking-actions.ts).
 *
 * Invariants protégés :
 *
 * 1. sendEvent "booking/omra.confirmed" est câblé et conditionné sur un
 *    email de contact disponible.
 *
 * 2. Le payload contient les champs requis par le handler Inngest
 *    (process-omra-confirmed.ts) : publicRef, packageName, pilgrimsCount,
 *    departureDate, contactEmail.
 *
 * 3. La protection .catch() est présente — l'échec Inngest ne doit JAMAIS
 *    annuler la réservation déjà enregistrée.
 *
 * 4. packageName et contactEmail transitent depuis le retour de la
 *    transaction interne (résolution serveur, jamais fournie par le client).
 *
 * Pattern readFileSync (même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts) : `"use server"` empêche d'importer le fichier
 * directement sous `node --test`.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/omra/guest-booking-actions.ts"),
  "utf8",
)

// ─── Invariant 1 : sendEvent câblé ────────────────────────────────────────

test("OMRA-VOUCHER-01 : sendEvent importé depuis @/lib/inngest/client", () => {
  assert.match(src, /import.*sendEvent.*from.*@\/lib\/inngest\/client/)
})

test("OMRA-VOUCHER-01 : sendEvent booking/omra.confirmed câblé", () => {
  assert.match(src, /sendEvent\("booking\/omra\.confirmed"/)
})

test("OMRA-VOUCHER-01 : sendEvent déclenché conditionnellement (contactEmail)", () => {
  // Aucun envoi si le premier pèlerin n'a pas fourni d'email.
  assert.match(src, /if\s*\(result\.contactEmail\)/)
})

// ─── Invariant 2 : protection .catch() ────────────────────────────────────

test("OMRA-VOUCHER-01 : sendEvent protégé par .catch() (booking non annulé si Inngest indisponible)", () => {
  assert.match(src, /sendEvent\("booking\/omra\.confirmed"[\s\S]*?\)\.catch\(/)
})

// ─── Invariant 3 : payload complet ────────────────────────────────────────

test("OMRA-VOUCHER-01 : payload contient publicRef", () => {
  assert.match(src, /publicRef:\s*result\.publicRef/)
})

test("OMRA-VOUCHER-01 : payload contient agencyId", () => {
  assert.match(src, /agencyId,/)
})

test("OMRA-VOUCHER-01 : payload contient packageName depuis result (résolution serveur)", () => {
  assert.match(src, /packageName:\s*result\.packageName/)
})

test("OMRA-VOUCHER-01 : payload contient pilgrimsCount depuis pilgrimCount (count réel)", () => {
  assert.match(src, /pilgrimsCount:\s*pilgrimCount/)
})

test("OMRA-VOUCHER-01 : payload contient departureDate depuis booking.departureDate", () => {
  assert.match(src, /departureDate:\s*booking\.departureDate/)
})

test("OMRA-VOUCHER-01 : payload contient contactEmail depuis result (résolution serveur)", () => {
  assert.match(src, /contactEmail:\s*result\.contactEmail/)
})

test("OMRA-VOUCHER-01 : payload contient totalTnd", () => {
  assert.match(src, /totalTnd:\s*result\.totalTnd/)
})

// ─── Invariant 4 : packageName dans le retour de transaction ──────────────

test("OMRA-VOUCHER-01 : packageName retourné depuis la transaction (pkg.name)", () => {
  assert.match(src, /packageName:\s*pkg\.name/)
})

test("OMRA-VOUCHER-01 : contactEmail retourné depuis la transaction (firstPilgrim.email)", () => {
  assert.match(src, /contactEmail:\s*firstPilgrim\.email/)
})
