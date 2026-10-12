/**
 * FLIGHT-CANCEL-FIN-01 — Invariants statiques : trace financière complète
 * lors d'un échec GDS (autoRefundOnFlightFailure).
 *
 * Vérifie que :
 *  1. flight-refund-on-failure.ts importe recordCancellationFinancials.
 *  2. flight-refund-on-failure.ts importe reverseCommissionOnCancellation.
 *  3. recordCancellationFinancials est appelé après un remboursement réussi.
 *  4. reverseCommissionOnCancellation est appelé après recordCancellationFinancials.
 *  5. Les appels financiers sont conditionnés au succès du remboursement
 *     (result.ok || result.code === "NO_CAPTURED_PAYMENT").
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import assert from "node:assert/strict"

const src = readFileSync(
  join(process.cwd(), "lib/vols/flight-refund-on-failure.ts"),
  "utf8",
)

describe("FLIGHT-CANCEL-FIN-01 — Trace financière sur échec GDS", () => {
  it("importe recordCancellationFinancials", () => {
    assert.ok(
      src.includes("recordCancellationFinancials"),
      "flight-refund-on-failure.ts doit importer recordCancellationFinancials",
    )
  })

  it("importe reverseCommissionOnCancellation", () => {
    assert.ok(
      src.includes("reverseCommissionOnCancellation"),
      "flight-refund-on-failure.ts doit importer reverseCommissionOnCancellation",
    )
  })

  it("appelle recordCancellationFinancials", () => {
    assert.ok(
      src.includes("await recordCancellationFinancials("),
      "flight-refund-on-failure.ts doit appeler recordCancellationFinancials",
    )
  })

  it("appelle reverseCommissionOnCancellation", () => {
    assert.ok(
      src.includes("await reverseCommissionOnCancellation("),
      "flight-refund-on-failure.ts doit appeler reverseCommissionOnCancellation",
    )
  })

  it("conditionne les appels financiers au succès (result.ok || NO_CAPTURED_PAYMENT)", () => {
    assert.ok(
      src.includes("NO_CAPTURED_PAYMENT"),
      "le garde financier doit traiter NO_CAPTURED_PAYMENT comme succès",
    )
    // recordCancellationFinancials doit apparaître APRÈS le test result.ok
    const okIndex = src.indexOf("result.ok || result.code")
    const recordIndex = src.indexOf("await recordCancellationFinancials(")
    assert.ok(
      okIndex < recordIndex,
      "recordCancellationFinancials doit être dans le bloc conditionnel après result.ok check",
    )
  })

  it("reverseCommissionOnCancellation est appelé dans le même bloc conditionnel que recordCancellationFinancials", () => {
    const recordIndex = src.indexOf("await recordCancellationFinancials(")
    const reverseIndex = src.indexOf("await reverseCommissionOnCancellation(")
    // Les deux doivent être présents et reverseCommissionOnCancellation après recordCancellationFinancials
    assert.ok(recordIndex > 0 && reverseIndex > 0, "les deux appels financiers doivent être présents")
    assert.ok(
      reverseIndex > recordIndex,
      "reverseCommissionOnCancellation doit être appelé après recordCancellationFinancials",
    )
  })
})
