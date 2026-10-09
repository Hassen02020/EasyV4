/**
 * INNGEST-HANDLER-WIRING-01/transfer — invariants statiques sur le handler
 * process-transfer-confirmed.ts.
 *
 * Invariants protégés :
 *
 * 1. Écoute l'événement "booking/transfer.confirmed".
 *
 * 2. Envoie email client via Resend (step "send-client-email").
 *
 * 3. SÉCURITÉ SMS CHAUFFEUR — le SMS chauffeur (step "send-driver-sms")
 *    lit le numéro depuis la table reservationTransfer.driverPhone (DB),
 *    jamais depuis d.customerPhone (payload événement).
 *    Un chauffeur est un destinataire différent du client — toute substitution
 *    silencieuse constituerait une fuite de données.
 *
 * 4. Aucun envoi si driverPhone absent (reason: no_driver_assigned).
 *
 * 5. L'event "booking/transfer.confirmed" est déclaré dans client.ts.
 *
 * 6. processTransferConfirmed est exporté depuis l'index barrel.
 *
 * Pattern readFileSync — même discipline que lib/cars/__tests__/
 * car-voucher-wiring.test.ts.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const processSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/process-transfer-confirmed.ts"),
  "utf8",
)
const clientSrc = readFileSync(join(ROOT, "lib/inngest/client.ts"), "utf8")
const indexSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/index.ts"),
  "utf8",
)

// ─── Invariant 1 : écoute le bon événement ────────────────────────────────

test('INNGEST-HANDLER-WIRING-01/transfer : écoute "booking/transfer.confirmed"', () => {
  assert.match(processSrc, /"booking\/transfer\.confirmed"/)
})

// ─── Invariant 2 : email client via Resend ────────────────────────────────

test("INNGEST-HANDLER-WIRING-01/transfer : step send-client-email présent", () => {
  assert.match(processSrc, /["']send-client-email["']/)
})

test("INNGEST-HANDLER-WIRING-01/transfer : email client envoie via Resend", () => {
  assert.match(processSrc, /resend\.emails\.send/)
})

test("INNGEST-HANDLER-WIRING-01/transfer : email conditionné sur d.customerEmail", () => {
  assert.match(processSrc, /!d\.customerEmail/)
})

// ─── Invariant 3 : SMS chauffeur depuis la DB — jamais customerPhone ──────

test("INNGEST-HANDLER-WIRING-01/transfer : step send-driver-sms présent", () => {
  assert.match(processSrc, /["']send-driver-sms["']/)
})

test("INNGEST-HANDLER-WIRING-01/transfer : SMS chauffeur lit driverPhone depuis reservationTransfer (DB)", () => {
  assert.match(processSrc, /driverPhone:\s*reservationTransfer\.driverPhone/)
})

test("INNGEST-HANDLER-WIRING-01/transfer : SMS chauffeur envoie à transfer.driverPhone (jamais d.customerPhone)", () => {
  assert.match(processSrc, /To:\s*transfer\.driverPhone/)
  assert.doesNotMatch(processSrc, /To:\s*d\.customerPhone/)
})

// ─── Invariant 4 : skip si pas de chauffeur assigné ──────────────────────

test("INNGEST-HANDLER-WIRING-01/transfer : SMS skipé si !transfer?.driverPhone (no_driver_assigned)", () => {
  assert.match(processSrc, /!transfer\?\.driverPhone/)
  assert.match(processSrc, /no_driver_assigned/)
})

// ─── Invariant 5 : déclaration dans client.ts ─────────────────────────────

test('INNGEST-HANDLER-WIRING-01/transfer : client.ts déclare "booking/transfer.confirmed"', () => {
  assert.match(clientSrc, /"booking\/transfer\.confirmed"/)
})

test("INNGEST-HANDLER-WIRING-01/transfer : client.ts event contient customerEmail et customerPhone", () => {
  const idx = clientSrc.indexOf('"booking/transfer.confirmed"')
  const block = clientSrc.slice(idx, idx + 500)
  assert.match(block, /customerEmail/)
  assert.match(block, /customerPhone/)
})

// ─── Invariant 6 : export barrel ──────────────────────────────────────────

test("INNGEST-HANDLER-WIRING-01/transfer : index.ts exporte processTransferConfirmed", () => {
  assert.match(
    indexSrc,
    /processTransferConfirmed.*from.*process-transfer-confirmed/,
  )
})
