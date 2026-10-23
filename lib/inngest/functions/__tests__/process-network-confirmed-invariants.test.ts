/**
 * INNGEST-HANDLER-NETWORK-01 — invariants statiques sur
 * process-network-confirmed.ts et son intégration.
 *
 * Pattern readFileSync — même discipline que les autres wiring tests.
 *
 * Invariants protégés :
 *
 *  1. processNetworkConfirmed écoute "booking/network.confirmed".
 *  2. Le step "send-network-email" est présent.
 *  3. Guard RESEND_API_KEY présent dans le step email.
 *  4. Les données personnelles ne sont pas exposées dans les logs
 *     (contactEmail absent des console.error).
 *  5. onFailure câblé avec makeOnFailure("process-network-confirmed").
 *  6. Le step "generate-invoice" appelle generateInvoiceForReservation
 *     avec agencyId/reservationId/actorUserId issus de l'event.
 *  7. processNetworkConfirmed exporté depuis l'index barrel.
 *  8. processNetworkConfirmed enregistré dans app/api/inngest/route.ts.
 *  9. guest-booking-actions.ts n'appelle plus generateInvoiceForReservation
 *     directement (déplacé dans Inngest — CAS-C).
 * 10. sendEvent("booking/network.confirmed") toujours câblé dans
 *     guest-booking-actions.ts.
 * 11. client.ts déclare le payload complet sur "booking/network.confirmed"
 *     (publicRef, productName, quantity, totalTnd, contactEmail).
 * 12. Le handler retourne { reservationId: d.reservationId }.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const handlerSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/process-network-confirmed.ts"),
  "utf8",
)
const indexSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/index.ts"),
  "utf8",
)
const routeSrc = readFileSync(join(ROOT, "app/api/inngest/route.ts"), "utf8")
const clientSrc = readFileSync(join(ROOT, "lib/inngest/client.ts"), "utf8")
const guestActionsSrc = readFileSync(
  join(ROOT, "lib/network/guest-booking-actions.ts"),
  "utf8",
)

// ─── Invariant 1 : écoute le bon événement ────────────────────────────────

test('INNGEST-HANDLER-NETWORK-01 : processNetworkConfirmed écoute "booking/network.confirmed"', () => {
  assert.match(handlerSrc, /"booking\/network\.confirmed"/)
})

// ─── Invariant 2 : step email présent ─────────────────────────────────────

test("INNGEST-HANDLER-NETWORK-01 : step send-network-email présent", () => {
  assert.match(handlerSrc, /["']send-network-email["']/)
})

// ─── Invariant 3 : guard RESEND_API_KEY ───────────────────────────────────

test("INNGEST-HANDLER-NETWORK-01 : guard RESEND_API_KEY présent dans le step email", () => {
  assert.match(handlerSrc, /process\.env\.RESEND_API_KEY/)
})

// ─── Invariant 4 : données personnelles absentes des logs ─────────────────

test("INNGEST-HANDLER-NETWORK-01 : contactEmail absent des console.error (données perso non exposées)", () => {
  const errorBlocks = handlerSrc.split("console.error")
  for (const block of errorBlocks.slice(1)) {
    const call = block.slice(0, 200)
    assert.doesNotMatch(
      call,
      /contactEmail/,
      "contactEmail ne doit pas apparaître dans un console.error",
    )
  }
})

// ─── Invariant 5 : onFailure câblé ────────────────────────────────────────

test('INNGEST-HANDLER-NETWORK-01 : onFailure câblé avec makeOnFailure("process-network-confirmed")', () => {
  assert.match(
    handlerSrc,
    /onFailure:\s*makeOnFailure\("process-network-confirmed"\)/,
  )
})

// ─── Invariant 6 : step facture avec les bons arguments ───────────────────

test("INNGEST-HANDLER-NETWORK-01 : step generate-invoice présent", () => {
  assert.match(handlerSrc, /["']generate-invoice["']/)
})

test("INNGEST-HANDLER-NETWORK-01 : generateInvoiceForReservation appelée avec agencyId/reservationId/actorUserId issus de l'event", () => {
  assert.match(handlerSrc, /generateInvoiceForReservation\(/)
  const idx = handlerSrc.indexOf("generateInvoiceForReservation({")
  const block = handlerSrc.slice(idx, idx + 200)
  assert.match(block, /agencyId:\s*d\.agencyId/)
  assert.match(block, /reservationId:\s*d\.reservationId/)
  assert.match(block, /actorUserId:\s*""/)
})

// ─── Invariant 7 : export depuis l'index barrel ───────────────────────────

test("INNGEST-HANDLER-NETWORK-01 : processNetworkConfirmed exporté depuis l'index barrel", () => {
  assert.match(
    indexSrc,
    /processNetworkConfirmed.*from.*process-network-confirmed/,
  )
})

// ─── Invariant 8 : enregistrement dans route.ts ───────────────────────────

test("INNGEST-HANDLER-NETWORK-01 : processNetworkConfirmed importé dans app/api/inngest/route.ts", () => {
  assert.match(routeSrc, /processNetworkConfirmed/)
})

test("INNGEST-HANDLER-NETWORK-01 : processNetworkConfirmed dans le tableau functions de route.ts", () => {
  const functionsBlockIdx = routeSrc.indexOf("functions: [")
  assert.match(routeSrc.slice(functionsBlockIdx), /processNetworkConfirmed,/)
})

// ─── Invariant 9 : CAS-C — plus d'appel direct dans guest-booking-actions ─

test("INNGEST-HANDLER-NETWORK-01 : guest-booking-actions.ts n'appelle plus generateInvoiceForReservation directement (CAS-C déplacé dans Inngest)", () => {
  assert.doesNotMatch(guestActionsSrc, /generateInvoiceForReservation/)
})

// ─── Invariant 10 : sendEvent toujours câblé ─────────────────────────────

test('INNGEST-HANDLER-NETWORK-01 : sendEvent("booking/network.confirmed") présent dans guest-booking-actions.ts', () => {
  assert.match(guestActionsSrc, /sendEvent\("booking\/network\.confirmed"/)
})

// ─── Invariant 11 : payload complet dans client.ts ────────────────────────

test('INNGEST-HANDLER-NETWORK-01 : client.ts — "booking/network.confirmed" contient les champs requis', () => {
  const idx = clientSrc.indexOf('"booking/network.confirmed"')
  const block = clientSrc.slice(idx, idx + 500)
  assert.match(block, /publicRef/)
  assert.match(block, /productName/)
  assert.match(block, /quantity/)
  assert.match(block, /totalTnd/)
  assert.match(block, /contactEmail/)
})

// ─── Invariant 12 : valeur de retour ─────────────────────────────────────

test("INNGEST-HANDLER-NETWORK-01 : handler retourne { reservationId: d.reservationId }", () => {
  assert.match(
    handlerSrc,
    /return\s*\{\s*reservationId:\s*d\.reservationId\s*\}/,
  )
})
