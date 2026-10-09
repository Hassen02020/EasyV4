/**
 * INNGEST-HANDLER-WIRING-02/flights — invariants statiques sur le handler
 * process-flight-confirmed.ts.
 *
 * Invariants protégés :
 *
 * 1. Écoute l'événement "booking/flight.confirmed".
 *
 * 2. IDEMPOTENCE — vérifie `hasFlightVoucherAlreadySent` avant tout envoi.
 *    Utilise la table `auditEvents` (pas notificationIdempotency — patron
 *    distinct du hotel handler) pour empêcher le renvoi si Inngest rejoue.
 *
 * 3. Enregistre `recordFlightVoucherSent` TOUJOURS après succès (pas
 *    conditionnel à l'envoi email — même si RESEND_API_KEY absent).
 *
 * 4. Génère le PDF via `renderFlightVoucherPdf`.
 *
 * 5. Encode le PDF en base64.
 *
 * 6. Envoie via Resend conditionné sur `process.env.RESEND_API_KEY`
 *    (email optionnel — ne bloque pas l'idempotence si absent).
 *
 * 7. PDF en pièce jointe avec filename `voucher-vol-${d.publicRef}.pdf`.
 *
 * 8. L'event "booking/flight.confirmed" est déclaré dans client.ts avec
 *    les champs requis.
 *
 * 9. processFlightConfirmed est exporté depuis l'index barrel.
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
  join(ROOT, "lib/inngest/functions/process-flight-confirmed.ts"),
  "utf8",
)
const clientSrc = readFileSync(join(ROOT, "lib/inngest/client.ts"), "utf8")
const indexSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/index.ts"),
  "utf8",
)

// ─── Invariant 1 : écoute le bon événement ────────────────────────────────

test('INNGEST-HANDLER-WIRING-02/flights : écoute "booking/flight.confirmed"', () => {
  assert.match(processSrc, /"booking\/flight\.confirmed"/)
})

// ─── Invariant 2 : idempotence via auditEvents (pas notificationIdempotency)

test("INNGEST-HANDLER-WIRING-02/flights : vérifie hasFlightVoucherAlreadySent avant envoi", () => {
  assert.match(processSrc, /hasFlightVoucherAlreadySent/)
})

test("INNGEST-HANDLER-WIRING-02/flights : utilise auditEvents pour l'idempotence (pas notificationIdempotency)", () => {
  assert.match(processSrc, /auditEvents/)
  assert.doesNotMatch(processSrc, /notificationIdempotency/)
})

test("INNGEST-HANDLER-WIRING-02/flights : retourne skipped:true si déjà envoyé", () => {
  assert.match(processSrc, /skipped:\s*true/)
})

// ─── Invariant 3 : recordFlightVoucherSent toujours appelé ────────────────

test("INNGEST-HANDLER-WIRING-02/flights : enregistre recordFlightVoucherSent après succès", () => {
  assert.match(processSrc, /recordFlightVoucherSent/)
})

// ─── Invariant 4 : génération PDF ─────────────────────────────────────────

test("INNGEST-HANDLER-WIRING-02/flights : génère le PDF via renderFlightVoucherPdf", () => {
  assert.match(processSrc, /renderFlightVoucherPdf/)
})

// ─── Invariant 5 : encodage base64 ────────────────────────────────────────

test("INNGEST-HANDLER-WIRING-02/flights : encode le PDF en base64", () => {
  assert.match(processSrc, /pdfBase64/)
  assert.match(processSrc, /toString\(["']base64["']\)/)
})

// ─── Invariant 6 : email conditionné sur RESEND_API_KEY ──────────────────

test("INNGEST-HANDLER-WIRING-02/flights : envoi email conditionné sur RESEND_API_KEY (optionnel)", () => {
  assert.match(processSrc, /process\.env\.RESEND_API_KEY/)
})

test("INNGEST-HANDLER-WIRING-02/flights : email envoyé via Resend", () => {
  assert.match(processSrc, /resend\.emails\.send/)
})

// ─── Invariant 7 : pièce jointe PDF avec filename correct ────────────────

test("INNGEST-HANDLER-WIRING-02/flights : PDF en pièce jointe avec filename voucher-vol-", () => {
  assert.match(processSrc, /filename:\s*`voucher-vol-/)
})

// ─── Invariant 8 : déclaration dans client.ts ─────────────────────────────

test('INNGEST-HANDLER-WIRING-02/flights : client.ts déclare "booking/flight.confirmed"', () => {
  assert.match(clientSrc, /"booking\/flight\.confirmed"/)
})

test("INNGEST-HANDLER-WIRING-02/flights : client.ts event contient customerEmail, customerName, origin, destination, departureAt, carrier, flightNumber, adults, totalTnd", () => {
  const idx = clientSrc.indexOf('"booking/flight.confirmed"')
  const block = clientSrc.slice(idx, idx + 600)
  assert.match(block, /customerEmail/)
  assert.match(block, /customerName/)
  assert.match(block, /origin/)
  assert.match(block, /destination/)
  assert.match(block, /departureAt/)
  assert.match(block, /carrier/)
  assert.match(block, /flightNumber/)
  assert.match(block, /adults/)
  assert.match(block, /totalTnd/)
})

// ─── Invariant 9 : export barrel ──────────────────────────────────────────

test("INNGEST-HANDLER-WIRING-02/flights : index.ts exporte processFlightConfirmed", () => {
  assert.match(
    indexSrc,
    /processFlightConfirmed.*from.*process-flight-confirmed/,
  )
})
