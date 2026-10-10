/**
 * CAR-VOUCHER-01 — invariants statiques câblage voucher voiture.
 *
 * Vérifie que :
 *  - les deux actions voiture (B2B + B2C) importent sendEvent et envoient
 *    l'événement booking/car.confirmed avec les champs obligatoires
 *  - le client Inngest déclare l'event type booking/car.confirmed
 *  - la fonction Inngest est exportée depuis le barrel index.ts
 *
 * Pattern readFileSync (ne peut pas importer les fichiers "use server" sous
 * node:test hors bundler Next.js — même contrainte que les autres tests du
 * module car).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const actionsSrc = readFileSync(join(ROOT, "lib/cars/actions.ts"), "utf8")
const guestSrc = readFileSync(
  join(ROOT, "lib/cars/guest-booking-actions.ts"),
  "utf8",
)
const clientSrc = readFileSync(join(ROOT, "lib/inngest/client.ts"), "utf8")
const indexSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/index.ts"),
  "utf8",
)
const processSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/process-car-confirmed.ts"),
  "utf8",
)

/* -------------------------------------------------------------------------- */
/* Câblage B2B — lib/cars/actions.ts                                          */
/* -------------------------------------------------------------------------- */

test("actions.ts : importe sendEvent depuis lib/inngest/client", () => {
  assert.match(
    actionsSrc,
    /import\s*\{[^}]*sendEvent[^}]*\}\s*from\s*["']@\/lib\/inngest\/client["']/,
  )
})

test('actions.ts : envoie l\'événement "booking/car.confirmed" après booking', () => {
  assert.match(actionsSrc, /sendEvent\("booking\/car\.confirmed"/)
})

test("actions.ts : payload contient customerEmail, customerName, categoryName, pickupLocationName, dropoffLocationName", () => {
  assert.match(actionsSrc, /customerEmail:/)
  assert.match(actionsSrc, /customerName:/)
  assert.match(actionsSrc, /categoryName:/)
  assert.match(actionsSrc, /pickupLocationName:/)
  assert.match(actionsSrc, /dropoffLocationName:/)
})

test("actions.ts : sendEvent est fire-and-forget (.catch())", () => {
  assert.match(actionsSrc, /\.catch\(/)
  assert.doesNotMatch(actionsSrc, /await sendEvent\("booking\/car\.confirmed"/)
})

test("actions.ts : retourne categoryName, pickupLocationName, dropoffLocationName, rentalDays depuis la transaction", () => {
  assert.match(actionsSrc, /categoryName:\s*category\?\.name/)
  assert.match(actionsSrc, /pickupLocationName:\s*pickupLocation\?\.name/)
  assert.match(actionsSrc, /dropoffLocationName:\s*dropoffLocation\?\.name/)
  assert.match(actionsSrc, /rentalDays:\s*pricing\.rentalDays/)
})

/* -------------------------------------------------------------------------- */
/* Câblage B2C — lib/cars/guest-booking-actions.ts                            */
/* VOUCHER-STATUS-GUARD-01 : cars B2C = toujours status "pending" (paiement   */
/* différé, aucune voie CB). sendEvent ne doit PAS être envoyé               */
/* inconditionnellement — uniquement si isImmediatelyPaid.                   */
/* -------------------------------------------------------------------------- */

test("VOUCHER-STATUS-GUARD-01 (cars B2C) : sendEvent PAS importé dans guest-booking-actions.ts", () => {
  // VOUCHER-STATUS-GUARD-01 — cars B2C sont toujours status "pending" ;
  // le voucher ne doit être envoyé qu'après confirmation réelle du paiement.
  assert.doesNotMatch(
    guestSrc,
    /import\s*\{[^}]*sendEvent[^}]*\}\s*from\s*["']@\/lib\/inngest\/client["']/,
  )
})

test("VOUCHER-STATUS-GUARD-01 (cars B2C) : sendEvent booking/car.confirmed NON câblé inconditionnellement (hors commentaires)", () => {
  // Exclut les lignes commentées (// sendEvent...) — seule une ligne de code
  // active sans préfixe // déclencherait cette assertion.
  assert.doesNotMatch(
    guestSrc,
    /^(?!\s*\/\/).*sendEvent\("booking\/car\.confirmed"/m,
  )
})

test("VOUCHER-STATUS-GUARD-01 (cars B2C) : commentaire de garde présent (isImmediatelyPaid)", () => {
  // Le commentaire documente la protection à re-déclencher dès qu'une voie CB sera ajoutée.
  assert.match(guestSrc, /isImmediatelyPaid/)
})

test("guest-booking-actions.ts : retourne rentalDays, categoryName depuis la transaction", () => {
  assert.match(guestSrc, /rentalDays:\s*pricing\.rentalDays/)
  assert.match(guestSrc, /categoryName:\s*category\?\.name/)
})

/* -------------------------------------------------------------------------- */
/* Type event — lib/inngest/client.ts                                         */
/* -------------------------------------------------------------------------- */

test('client.ts : déclare l\'event "booking/car.confirmed"', () => {
  assert.match(clientSrc, /"booking\/car\.confirmed"/)
})

test("client.ts : event booking/car.confirmed contient customerEmail, rentalDays, guestAccessToken", () => {
  const eventBlock = clientSrc.slice(
    clientSrc.indexOf('"booking/car.confirmed"'),
    clientSrc.indexOf('"booking/car.confirmed"') + 600,
  )
  assert.match(eventBlock, /customerEmail/)
  assert.match(eventBlock, /rentalDays/)
  assert.match(eventBlock, /guestAccessToken/)
})

/* -------------------------------------------------------------------------- */
/* Enregistrement — lib/inngest/functions/index.ts                            */
/* -------------------------------------------------------------------------- */

test("index.ts : exporte processCarConfirmed depuis process-car-confirmed", () => {
  assert.match(indexSrc, /processCarConfirmed.*from.*process-car-confirmed/)
})

/* -------------------------------------------------------------------------- */
/* Fonction Inngest — process-car-confirmed.ts                                */
/* -------------------------------------------------------------------------- */

test("process-car-confirmed.ts : écoute booking/car.confirmed", () => {
  assert.match(processSrc, /"booking\/car\.confirmed"/)
})

test("process-car-confirmed.ts : utilise renderCarVoucherPdf", () => {
  assert.match(processSrc, /renderCarVoucherPdf/)
})

test("process-car-confirmed.ts : vérifie l'idempotence avant envoi", () => {
  assert.match(processSrc, /hasCarVoucherAlreadySent/)
})

test("process-car-confirmed.ts : envoie via Resend avec pièce jointe PDF", () => {
  assert.match(processSrc, /resend\.emails\.send/)
  assert.match(processSrc, /attachments/)
  assert.match(processSrc, /pdfBase64/)
})
