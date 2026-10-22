/**
 * MUTUELLE-CONCURRENCY-COMPLETE-01 (CAS-C) × MUTUELLE-INVOICE-SETTLEMENT-01
 * (réconciliation) — invariants statiques sur process-mutuelle-confirmed.ts,
 * recover-mutuelle-missing-invoices.ts et leur enregistrement réel dans
 * app/api/inngest/route.ts.
 *
 * Pattern readFileSync — même discipline que
 * lib/inngest/functions/__tests__/process-omra-confirmed-wiring.test.ts.
 *
 * Invariants protégés :
 *
 * 1. processMutuelleConfirmed écoute "booking/mutuelle.confirmed".
 * 2. Le step "generate-mutuelle-invoice" appelle
 *    generateIssuedInvoiceForReservation (jamais generateInvoiceForReservation
 *    — une approbation directeur n'est pas une preuve de paiement, voir
 *    MUTUELLE-INVOICE-SETTLEMENT-01) avec agencyId/reservationId/actorUserId
 *    issus de l'event (pas de valeur fabriquée/globale).
 * 3. client.ts déclare directorUserId sur l'event "booking/mutuelle.confirmed".
 * 4. requests-actions.ts n'appelle plus AUCUNE génération de facture en
 *    fire-and-forget (déplacé dans Inngest) et transmet bien directorUserId.
 * 5. recover-mutuelle-missing-invoices : déclenché par cron, exporté depuis
 *    l'index barrel, scope chaque écriture par l'agencyId réel de la ligne
 *    trouvée (jamais un contexte system/global), et génère également une
 *    facture "issued" (generateIssuedInvoiceForReservation), jamais "paid".
 * 6. processMutuelleConfirmed ET recoverMutuelleMissingInvoices sont
 *    effectivement enregistrés dans app/api/inngest/route.ts (gap
 *    préexistant constaté : processMutuelleConfirmed était exporté par
 *    l'index mais jamais enregistré ici avant ce chantier — sans quoi
 *    aucune fonction Mutuelle ne s'exécute jamais, quel que soit le code).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const processSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/process-mutuelle-confirmed.ts"),
  "utf8",
)
const recoverSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/recover-mutuelle-missing-invoices.ts"),
  "utf8",
)
const clientSrc = readFileSync(join(ROOT, "lib/inngest/client.ts"), "utf8")
const indexSrc = readFileSync(
  join(ROOT, "lib/inngest/functions/index.ts"),
  "utf8",
)
const requestsActionsSrc = readFileSync(
  join(ROOT, "lib/mutuelle/requests-actions.ts"),
  "utf8",
)
const routeSrc = readFileSync(join(ROOT, "app/api/inngest/route.ts"), "utf8")

// ─── Invariant 1 : écoute le bon événement ────────────────────────────────

test('CAS-C : processMutuelleConfirmed écoute "booking/mutuelle.confirmed"', () => {
  assert.match(processSrc, /"booking\/mutuelle\.confirmed"/)
})

// ─── Invariant 2 : step facture avec les bons arguments, pas fabriqués ───

test("CAS-C : step generate-mutuelle-invoice présent", () => {
  assert.match(processSrc, /["']generate-mutuelle-invoice["']/)
})

test("CAS-C : generateIssuedInvoiceForReservation (jamais generateInvoiceForReservation) appelée avec agencyId/reservationId/actorUserId issus de l'event", () => {
  assert.match(processSrc, /generateIssuedInvoiceForReservation\(/)
  assert.doesNotMatch(processSrc, /generateInvoiceForReservation\(/)
  const idx = processSrc.indexOf("generateIssuedInvoiceForReservation({")
  const block = processSrc.slice(idx, idx + 200)
  assert.match(block, /agencyId:\s*d\.agencyId/)
  assert.match(block, /reservationId:\s*d\.reservationId/)
  assert.match(block, /actorUserId:\s*d\.directorUserId/)
})

// ─── Invariant 3 : directorUserId déclaré sur l'event ────────────────────

test('CAS-C : client.ts event "booking/mutuelle.confirmed" contient directorUserId', () => {
  const idx = clientSrc.indexOf('"booking/mutuelle.confirmed"')
  const block = clientSrc.slice(idx, idx + 500)
  assert.match(block, /directorUserId/)
})

// ─── Invariant 4 : plus de fire-and-forget direct, directorUserId transmis ─

test("CAS-C : requests-actions.ts n'appelle plus aucune génération de facture directement (ni l'ancienne ni la nouvelle fonction)", () => {
  assert.doesNotMatch(requestsActionsSrc, /generateInvoiceForReservation/)
  assert.doesNotMatch(requestsActionsSrc, /generateIssuedInvoiceForReservation/)
})

test("CAS-C : requests-actions.ts transmet directorUserId à sendEvent", () => {
  const idx = requestsActionsSrc.indexOf(
    'sendEvent("booking/mutuelle.confirmed"',
  )
  assert.notEqual(idx, -1)
  const block = requestsActionsSrc.slice(idx, idx + 400)
  assert.match(block, /directorUserId:\s*userId/)
})

// ─── Invariant 5 : cron de récupération, scope par agence réelle ─────────

test("CAS-C : recoverMutuelleMissingInvoices déclenché par cron", () => {
  assert.match(recoverSrc, /triggers:\s*\{\s*cron:/)
})

test("CAS-C : recoverMutuelleMissingInvoices exporté depuis l'index barrel", () => {
  assert.match(
    indexSrc,
    /recoverMutuelleMissingInvoices.*from.*recover-mutuelle-missing-invoices/,
  )
})

test("CAS-C : generateIssuedInvoiceForReservation (jamais generateInvoiceForReservation) scopée avec l'agencyId réel de la ligne (pas un contexte system)", () => {
  assert.doesNotMatch(recoverSrc, /generateInvoiceForReservation\(/)
  const idx = recoverSrc.indexOf("generateIssuedInvoiceForReservation({")
  const block = recoverSrc.slice(idx, idx + 200)
  assert.match(block, /agencyId:\s*row\.agencyId/)
  assert.match(block, /reservationId:\s*row\.reservationId/)
  assert.match(block, /actorUserId:\s*row\.directorUserId/)
})

test("CAS-C : lib/finance/reconciliation.ts non modifié (contrat détection pure préservé)", () => {
  const reconciliationSrc = readFileSync(
    join(ROOT, "lib/finance/reconciliation.ts"),
    "utf8",
  )
  assert.doesNotMatch(reconciliationSrc, /generateInvoiceForReservation/)
  assert.doesNotMatch(reconciliationSrc, /generateIssuedInvoiceForReservation/)
})

// ─── Invariant 6 : enregistrement réel dans route.ts (gap préexistant comblé) ─

test("CAS-C : processMutuelleConfirmed enregistré dans app/api/inngest/route.ts", () => {
  assert.match(routeSrc, /processMutuelleConfirmed/)
  const functionsBlockIdx = routeSrc.indexOf("functions: [")
  assert.match(routeSrc.slice(functionsBlockIdx), /processMutuelleConfirmed,/)
})

test("CAS-C : recoverMutuelleMissingInvoices enregistré dans app/api/inngest/route.ts", () => {
  assert.match(routeSrc, /recoverMutuelleMissingInvoices/)
  const functionsBlockIdx = routeSrc.indexOf("functions: [")
  assert.match(
    routeSrc.slice(functionsBlockIdx),
    /recoverMutuelleMissingInvoices,/,
  )
})
