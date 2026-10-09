/**
 * TRANSFER-VOUCHER-B2C-01 — invariants statiques sur le câblage du voucher
 * de confirmation pour les transferts B2C (guest-booking-actions.ts).
 *
 * Ce fichier protège trois invariants clés :
 *
 * 1. sendEvent "booking/transfer.confirmed" est câblé dans la branche B2C,
 *    identiquement à la branche B2B (lib/transfers/actions.ts).
 *
 * 2. sendEvent est fire-and-forget (.catch) — l'échec email/SMS ne doit
 *    JAMAIS annuler la réservation déjà enregistrée.
 *
 * 3. Le payload contient les champs essentiels (publicRef, fromZone, toZone,
 *    vehicleType, pickupAt) pour que le handler Inngest puisse générer le
 *    mail de confirmation et le SMS conducteur.
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
  join(ROOT, "lib/transfers/guest-booking-actions.ts"),
  "utf8",
)

// ─── Invariant 1 : sendEvent câblé ────────────────────────────────────────

test("TRANSFER-VOUCHER-B2C-01 : sendEvent importé depuis @/lib/inngest/client", () => {
  assert.match(src, /import.*sendEvent.*from.*@\/lib\/inngest\/client/)
})

test("TRANSFER-VOUCHER-B2C-01 : sendEvent booking/transfer.confirmed câblé pour transferts B2C", () => {
  assert.match(src, /sendEvent\("booking\/transfer\.confirmed"/)
})

// ─── Invariant 2 : fire-and-forget ────────────────────────────────────────

test("TRANSFER-VOUCHER-B2C-01 : sendEvent fire-and-forget (pas d'await bloquant)", () => {
  // L'échec email/SMS ne doit JAMAIS annuler la réservation déjà enregistrée.
  assert.match(src, /sendEvent\("booking\/transfer\.confirmed"[\s\S]*?\)\.catch\(/)
})

test("TRANSFER-VOUCHER-B2C-01 : sendEvent déclenché conditionnellement (email ou phone)", () => {
  // Pas d'envoi si pas de coordonnées client — même discipline que B2B.
  assert.match(
    src,
    /if\s*\(input\.customer\.email\s*\|\|\s*input\.customer\.phone\)/,
  )
})

// ─── Invariant 3 : payload complet ────────────────────────────────────────

test("TRANSFER-VOUCHER-B2C-01 : payload contient publicRef", () => {
  assert.match(src, /publicRef:\s*result\.publicRef/)
})

test("TRANSFER-VOUCHER-B2C-01 : payload contient agencyId", () => {
  assert.match(src, /agencyId,/)
})

test("TRANSFER-VOUCHER-B2C-01 : payload contient customerEmail", () => {
  assert.match(src, /customerEmail:\s*input\.customer\.email\s*\?\?\s*""/)
})

test("TRANSFER-VOUCHER-B2C-01 : payload contient customerPhone", () => {
  assert.match(src, /customerPhone:\s*input\.customer\.phone/)
})

test("TRANSFER-VOUCHER-B2C-01 : payload contient fromZone depuis result.fromZoneName", () => {
  assert.match(src, /fromZone:\s*result\.fromZoneName/)
})

test("TRANSFER-VOUCHER-B2C-01 : payload contient toZone depuis result.toZoneName", () => {
  assert.match(src, /toZone:\s*result\.toZoneName/)
})

test("TRANSFER-VOUCHER-B2C-01 : payload contient vehicleType depuis input", () => {
  assert.match(src, /vehicleType:\s*input\.vehicleType/)
})

test("TRANSFER-VOUCHER-B2C-01 : payload contient pickupAt construit depuis pickupDate + pickupTime", () => {
  assert.match(
    src,
    /pickupAt:\s*`\$\{input\.pickupDate\}T\$\{input\.pickupTime\}:00`/,
  )
})

test("TRANSFER-VOUCHER-B2C-01 : payload contient totalTnd", () => {
  assert.match(src, /totalTnd:\s*result\.totalTnd/)
})

// ─── Invariant 4 : zone names propagés depuis la transaction ──────────────

test("TRANSFER-VOUCHER-B2C-01 : fromZoneName retourné par la transaction interne", () => {
  assert.match(src, /fromZoneName:\s*fromZone\?\.name\s*\?\?/)
})

test("TRANSFER-VOUCHER-B2C-01 : toZoneName retourné par la transaction interne", () => {
  assert.match(src, /toZoneName:\s*toZone\?\.name\s*\?\?/)
})
