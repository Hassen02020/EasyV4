/**
 * INNGEST-HANDLER-WIRING-01/omra — invariants statiques sur le handler
 * process-omra-confirmed.ts.
 *
 * Invariants protégés :
 *
 * 1. Écoute l'événement "booking/omra.confirmed".
 *
 * 2. Envoie email récapitulatif dossier pèlerins via Resend
 *    (step "send-omra-email") à d.contactEmail.
 *
 * 3. L'event "booking/omra.confirmed" est déclaré dans client.ts avec
 *    les champs requis : contactEmail, pilgrimsCount, departureDate,
 *    packageName, totalTnd.
 *
 * 4. processOmraConfirmed est exporté depuis l'index barrel.
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
  join(ROOT, "lib/inngest/functions/process-omra-confirmed.ts"),
  "utf8",
)
const clientSrc = readFileSync(join(ROOT, "lib/inngest/client.ts"), "utf8")
const indexSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/index.ts"),
  "utf8",
)

// ─── Invariant 1 : écoute le bon événement ────────────────────────────────

test('INNGEST-HANDLER-WIRING-01/omra : écoute "booking/omra.confirmed"', () => {
  assert.match(processSrc, /"booking\/omra\.confirmed"/)
})

// ─── Invariant 2 : email via Resend vers d.contactEmail ──────────────────

test("INNGEST-HANDLER-WIRING-01/omra : step send-omra-email présent", () => {
  assert.match(processSrc, /["']send-omra-email["']/)
})

test("INNGEST-HANDLER-WIRING-01/omra : email envoyé via Resend", () => {
  assert.match(processSrc, /resend\.emails\.send/)
})

test("INNGEST-HANDLER-WIRING-01/omra : email adressé à d.contactEmail (jamais d.customerEmail)", () => {
  assert.match(processSrc, /to:\s*d\.contactEmail/)
  assert.doesNotMatch(processSrc, /to:\s*d\.customerEmail/)
})

test("INNGEST-HANDLER-WIRING-01/omra : email conditionné sur RESEND_API_KEY", () => {
  assert.match(processSrc, /RESEND_API_KEY/)
})

// ─── Invariant 3 : déclaration dans client.ts ─────────────────────────────

test('INNGEST-HANDLER-WIRING-01/omra : client.ts déclare "booking/omra.confirmed"', () => {
  assert.match(clientSrc, /"booking\/omra\.confirmed"/)
})

test("INNGEST-HANDLER-WIRING-01/omra : client.ts event contient contactEmail, pilgrimsCount, departureDate, packageName", () => {
  const idx = clientSrc.indexOf('"booking/omra.confirmed"')
  const block = clientSrc.slice(idx, idx + 400)
  assert.match(block, /contactEmail/)
  assert.match(block, /pilgrimsCount/)
  assert.match(block, /departureDate/)
  assert.match(block, /packageName/)
})

// ─── Invariant 4 : export barrel ──────────────────────────────────────────

test("INNGEST-HANDLER-WIRING-01/omra : index.ts exporte processOmraConfirmed", () => {
  assert.match(indexSrc, /processOmraConfirmed.*from.*process-omra-confirmed/)
})
