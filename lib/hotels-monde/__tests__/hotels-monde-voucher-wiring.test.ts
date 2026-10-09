/**
 * HOTELS-MONDE-VOUCHER-01 — invariants statiques sur le câblage du voucher de
 * confirmation pour les réservations Hôtels Monde B2C
 * (guest-booking-actions.ts).
 *
 * Invariants protégés :
 *
 * 1. sendEvent "booking/confirmed" est câblé et conditionné sur un email de
 *    contact disponible (result.contactEmail).
 *
 * 2. Le payload contient tous les champs requis par le handler Inngest
 *    (process-booking-confirmed.ts) : reservationId, publicRef, agencyId,
 *    guestAccessToken, customerEmail, customerName, customerPhone, hotelName,
 *    checkIn, checkOut, nights, adults, children, totalTnd.
 *
 * 3. La protection .catch() est présente — l'échec Inngest ne doit JAMAIS
 *    annuler la réservation déjà enregistrée.
 *
 * 4. Les champs client proviennent du retour de la transaction interne
 *    (result.contactEmail, result.contactName, result.contactPhone) — jamais
 *    directement de l'input non validé.
 *
 * 5. Les champs hôtel proviennent de bookResult (réponse fournisseur confirmée)
 *    — jamais inventés ni recalculés.
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
  join(ROOT, "lib/hotels-monde/guest-booking-actions.ts"),
  "utf8",
)

// ─── Invariant 1 : sendEvent câblé ────────────────────────────────────────

test("HOTELS-MONDE-VOUCHER-01 : sendEvent importé depuis @/lib/inngest/client", () => {
  assert.match(src, /import.*sendEvent.*from.*@\/lib\/inngest\/client/)
})

test("HOTELS-MONDE-VOUCHER-01 : sendEvent booking/confirmed câblé", () => {
  assert.match(src, /sendEvent\("booking\/confirmed"/)
})

test("HOTELS-MONDE-VOUCHER-01 : sendEvent déclenché conditionnellement (contactEmail)", () => {
  assert.match(src, /if\s*\(result\.contactEmail\)/)
})

// ─── Invariant 2 : protection .catch() ────────────────────────────────────

test("HOTELS-MONDE-VOUCHER-01 : sendEvent protégé par .catch() (booking non annulé si Inngest indisponible)", () => {
  assert.match(src, /sendEvent\("booking\/confirmed"[\s\S]*?\)\.catch\(/)
})

// ─── Invariant 3 : payload complet ────────────────────────────────────────

test("HOTELS-MONDE-VOUCHER-01 : payload contient reservationId depuis result", () => {
  assert.match(src, /reservationId:\s*result\.reservationId/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient publicRef depuis result", () => {
  assert.match(src, /publicRef:\s*result\.publicRef/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient agencyId", () => {
  assert.match(src, /agencyId,/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient guestAccessToken depuis result (résolution serveur)", () => {
  assert.match(src, /guestAccessToken:\s*result\.guestAccessToken/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient customerEmail depuis result (résolution serveur)", () => {
  assert.match(src, /customerEmail:\s*result\.contactEmail/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient customerName depuis result (résolution serveur)", () => {
  assert.match(src, /customerName:\s*result\.contactName/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient customerPhone depuis result (résolution serveur)", () => {
  assert.match(src, /customerPhone:\s*result\.contactPhone/)
})

// ─── Invariant 4 : champs hôtel depuis bookResult (fournisseur confirmé) ──

test("HOTELS-MONDE-VOUCHER-01 : payload contient hotelName depuis bookResult (réponse fournisseur)", () => {
  assert.match(src, /hotelName:\s*bookResult\.name/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient checkIn depuis bookResult", () => {
  assert.match(src, /checkIn:\s*bookResult\.checkIn/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient checkOut depuis bookResult", () => {
  assert.match(src, /checkOut:\s*bookResult\.checkOut/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient nights depuis bookResult", () => {
  assert.match(src, /nights:\s*bookResult\.nights/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient adults depuis bookResult", () => {
  assert.match(src, /adults:\s*bookResult\.adults/)
})

test("HOTELS-MONDE-VOUCHER-01 : payload contient totalTnd depuis finalTotalTnd (prix de vente final)", () => {
  assert.match(src, /totalTnd:\s*finalTotalTnd/)
})
