/**
 * CANCEL-REPORTING-WIRING-01 — invariants statiques sur
 * lib/finance/cancellation-reporting.ts.
 *
 * Invariants protégés :
 * R1 : withSystemContext importé et utilisé (lecture admin uniquement).
 * R2 : cancellationFee lu via isNotNull() guard — filtre les lignes sans annulation.
 * R3 : cancelledAt filtré avec gte() pour la fenêtre 90 jours.
 * R4 : reservations.module utilisé pour le JOIN et le groupBy.
 * R5 : Aucun UPDATE / INSERT — lecture seule garantie.
 * R6 : getCancellationFinancialsSummary exportée (API publique du module).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const src = readFileSync(
  join(ROOT, "lib/finance/cancellation-reporting.ts"),
  "utf8",
)

// R1 : withSystemContext importé et appelé
test("CANCEL-REPORTING-WIRING-01/R1 : withSystemContext importé depuis tenant-context", () => {
  assert.match(src, /from\s+["']@\/lib\/db\/tenant-context["']/)
  assert.match(src, /withSystemContext/)
})

test("CANCEL-REPORTING-WIRING-01/R1b : withSystemContext appelé (pas juste importé)", () => {
  assert.match(src, /return withSystemContext\s*\(/)
})

// R2 : isNotNull guard sur cancellationFee
test("CANCEL-REPORTING-WIRING-01/R2 : isNotNull(reservationFinancials.cancellationFee) — filtre lignes sans annulation", () => {
  assert.match(
    src,
    /isNotNull\s*\(\s*reservationFinancials\.cancellationFee\s*\)/,
  )
})

// R3 : gte() sur cancelledAt pour la fenêtre temporelle
test("CANCEL-REPORTING-WIRING-01/R3 : gte(reservationFinancials.cancelledAt, since) — fenêtre 90j glissants", () => {
  assert.match(
    src,
    /gte\s*\(\s*reservationFinancials\.cancelledAt\s*,\s*since\s*\)/,
  )
})

// R4 : reservations.module utilisé dans le groupBy
test("CANCEL-REPORTING-WIRING-01/R4 : reservations.module — groupBy par module", () => {
  assert.match(src, /reservations\.module/)
  assert.match(src, /\.groupBy\s*\(\s*reservations\.module\s*\)/)
})

// R5 : lecture seule — pas d'INSERT ni d'UPDATE
test("CANCEL-REPORTING-WIRING-01/R5 : lecture seule — aucun tx.insert() ni tx.update()", () => {
  assert.doesNotMatch(src, /tx\.insert\s*\(/)
  assert.doesNotMatch(src, /tx\.update\s*\(/)
})

// R6 : export de la fonction principale
test("CANCEL-REPORTING-WIRING-01/R6 : getCancellationFinancialsSummary exportée", () => {
  assert.match(
    src,
    /export\s+async\s+function\s+getCancellationFinancialsSummary\s*\(/,
  )
})
