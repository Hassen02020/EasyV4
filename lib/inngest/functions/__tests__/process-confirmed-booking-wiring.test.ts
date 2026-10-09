/**
 * INNGEST-HANDLER-WIRING-01/hotels-monde — invariants statiques sur le handler
 * process-confirmed-booking.ts (hôtels monde / B2C).
 *
 * Invariants protégés :
 *
 * 1. Écoute l'événement "booking/confirmed".
 *
 * 2. IDEMPOTENCE — vérifie `hasVoucherEmailAlreadySucceeded` avant tout envoi.
 *    Utilise la table `notificationIdempotency` pour empêcher le renvoi du
 *    PDF/email si Inngest rejoue la fonction après un succès partiel.
 *
 * 3. Génère le PDF via `renderVoucherPdf`.
 *
 * 4. Envoie via `sendVoucherEmail` (pas d'appel direct à Resend dans ce handler
 *    — encapsulé dans le helper).
 *
 * 5. Enregistre la clé d'idempotence après succès (`recordVoucherEmailSent`).
 *
 * 6. L'event "booking/confirmed" est déclaré dans client.ts avec les champs
 *    requis : guestAccessToken, customerEmail, hotelName, checkIn, checkOut,
 *    nights, adults, totalTnd.
 *
 * 7. processConfirmedBooking est exporté depuis l'index barrel.
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
  join(ROOT, "lib/inngest/functions/process-confirmed-booking.ts"),
  "utf8",
)
const clientSrc = readFileSync(join(ROOT, "lib/inngest/client.ts"), "utf8")
const indexSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/index.ts"),
  "utf8",
)

// ─── Invariant 1 : écoute le bon événement ────────────────────────────────

test('INNGEST-HANDLER-WIRING-01/hotels-monde : écoute "booking/confirmed"', () => {
  assert.match(processSrc, /"booking\/confirmed"/)
})

// ─── Invariant 2 : idempotence ────────────────────────────────────────────

test("INNGEST-HANDLER-WIRING-01/hotels-monde : vérifie hasVoucherEmailAlreadySucceeded avant envoi", () => {
  assert.match(processSrc, /hasVoucherEmailAlreadySucceeded/)
})

test("INNGEST-HANDLER-WIRING-01/hotels-monde : utilise notificationIdempotency pour la garde", () => {
  assert.match(processSrc, /notificationIdempotency/)
})

test("INNGEST-HANDLER-WIRING-01/hotels-monde : enregistre recordVoucherEmailSent après succès", () => {
  assert.match(processSrc, /recordVoucherEmailSent/)
})

test("INNGEST-HANDLER-WIRING-01/hotels-monde : retourne alreadySent:true si déjà envoyé", () => {
  assert.match(processSrc, /alreadySent:\s*true/)
})

// ─── Invariant 3 : génération PDF ─────────────────────────────────────────

test("INNGEST-HANDLER-WIRING-01/hotels-monde : génère le PDF via renderVoucherPdf", () => {
  assert.match(processSrc, /renderVoucherPdf/)
})

test("INNGEST-HANDLER-WIRING-01/hotels-monde : encode le PDF en base64 pour Inngest", () => {
  assert.match(processSrc, /pdfBase64/)
  assert.match(processSrc, /toString\(["']base64["']\)/)
})

// ─── Invariant 4 : envoi email ────────────────────────────────────────────

test("INNGEST-HANDLER-WIRING-01/hotels-monde : envoie via sendVoucherEmail", () => {
  assert.match(processSrc, /sendVoucherEmail/)
})

// ─── Invariant 5 : déclaration dans client.ts ─────────────────────────────

test('INNGEST-HANDLER-WIRING-01/hotels-monde : client.ts déclare "booking/confirmed"', () => {
  assert.match(clientSrc, /"booking\/confirmed"/)
})

test("INNGEST-HANDLER-WIRING-01/hotels-monde : client.ts event contient guestAccessToken, customerEmail, hotelName, checkIn, checkOut, nights, adults, totalTnd", () => {
  const idx = clientSrc.indexOf('"booking/confirmed"')
  const block = clientSrc.slice(idx, idx + 900)
  assert.match(block, /guestAccessToken/)
  assert.match(block, /customerEmail/)
  assert.match(block, /hotelName/)
  assert.match(block, /checkIn/)
  assert.match(block, /checkOut/)
  assert.match(block, /nights/)
  assert.match(block, /adults/)
  assert.match(block, /totalTnd/)
})

// ─── Invariant 6 : export barrel ──────────────────────────────────────────

test("INNGEST-HANDLER-WIRING-01/hotels-monde : index.ts exporte processConfirmedBooking", () => {
  assert.match(
    indexSrc,
    /processConfirmedBooking.*from.*process-confirmed-booking/,
  )
})
