/**
 * TRANSFER-VOUCHER-B2C-01 — invariants statiques sur le câblage du voucher
 * de confirmation pour les transferts B2C (guest-booking-actions.ts).
 *
 * VOUCHER-STATUS-GUARD-01 (2026-10-10) : transferts B2C sont toujours
 * status "pending" (paiement différé, aucune voie CB). sendEvent NE DOIT
 * PAS être envoyé inconditionnellement. Le voucher ne sera envoyé qu'après
 * confirmation réelle du paiement, protégé par : if (isImmediatelyPaid) { ... }
 *
 * Ce fichier protège les invariants mis à jour :
 *
 * 1. sendEvent "booking/transfer.confirmed" N'EST PAS câblé inconditionnellement
 *    dans la branche B2C guest — uniquement après confirmation paiement.
 *
 * 2. Un commentaire de garde documente la protection (isImmediatelyPaid).
 *
 * 3. Les champs essentiels de la transaction (publicRef, fromZoneName, toZoneName,
 *    vehicleType, totalTnd) sont correctement propagés dans le résultat.
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

// ─── Invariant 1 : sendEvent PAS câblé inconditionnellement ──────────────

test("VOUCHER-STATUS-GUARD-01 (transferts B2C) : sendEvent PAS importé depuis @/lib/inngest/client", () => {
  // VOUCHER-STATUS-GUARD-01 — transferts B2C toujours status "pending" ;
  // le voucher ne doit être envoyé qu'après confirmation réelle du paiement.
  assert.doesNotMatch(src, /import.*sendEvent.*from.*@\/lib\/inngest\/client/)
})

test("VOUCHER-STATUS-GUARD-01 (transferts B2C) : sendEvent booking/transfer.confirmed NON câblé inconditionnellement (hors commentaires)", () => {
  // Exclut les lignes commentées (// sendEvent...) — seule une ligne de code
  // active sans préfixe // déclencherait cette assertion.
  assert.doesNotMatch(
    src,
    /^(?!\s*\/\/).*sendEvent\("booking\/transfer\.confirmed"/m,
  )
})

// ─── Invariant 2 : commentaire de garde présent ───────────────────────────

test("VOUCHER-STATUS-GUARD-01 (transferts B2C) : commentaire de garde présent (isImmediatelyPaid)", () => {
  // Le commentaire documente la protection à re-déclencher dès qu'une voie CB sera ajoutée.
  assert.match(src, /isImmediatelyPaid/)
})

// ─── Invariant 3 : données transaction correctement propagées ─────────────

test("TRANSFER-VOUCHER-B2C-01 : publicRef retourné depuis la transaction interne", () => {
  assert.match(src, /publicRef:\s*result\.publicRef/)
})

test("TRANSFER-VOUCHER-B2C-01 : agencyId utilisé dans les insertions", () => {
  assert.match(src, /agencyId,/)
})

test("TRANSFER-VOUCHER-B2C-01 : vehicleType depuis input dans reservationTransfer", () => {
  assert.match(src, /vehicleType:\s*input\.vehicleType/)
})

test("TRANSFER-VOUCHER-B2C-01 : totalTnd retourné depuis la transaction interne", () => {
  assert.match(src, /totalTnd:\s*result\.totalTnd/)
})

// ─── Invariant 4 : zone names propagés depuis la transaction ──────────────

test("TRANSFER-VOUCHER-B2C-01 : fromZoneName retourné par la transaction interne", () => {
  assert.match(src, /fromZoneName:\s*fromZone\?\.name\s*\?\?/)
})

test("TRANSFER-VOUCHER-B2C-01 : toZoneName retourné par la transaction interne", () => {
  assert.match(src, /toZoneName:\s*toZone\?\.name\s*\?\?/)
})
