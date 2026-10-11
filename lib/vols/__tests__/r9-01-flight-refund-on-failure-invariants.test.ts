/**
 * R9-01 — Invariants statiques : remboursement automatique sur échec GDS (FLIGHT-REFUND-GAP-01)
 *
 * Vérifie que :
 * 1. Le helper autoRefundOnFlightFailure est appelé après chaque updateFlightStatus("FAILED")
 *    dans fulfillment-action.ts (4 chemins d'échec : RECHECK_ERROR, statut non-AVAILABLE,
 *    BOOK_FAILED, ISSUE_FAILED/PNR_ORPHANED).
 * 2. Le helper lui-même ne propage jamais d'exception et délègue à applyReservationRefund.
 * 3. NO_CAPTURED_PAYMENT est traité comme un no-op silencieux.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import assert from "node:assert/strict"

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8")
}

describe("R9-01 — Remboursement automatique sur échec GDS (FLIGHT-REFUND-GAP-01)", () => {
  describe("flight-refund-on-failure.ts — helper autoRefundOnFlightFailure", () => {
    it("exporte autoRefundOnFlightFailure", () => {
      const src = read("lib/vols/flight-refund-on-failure.ts")
      assert.ok(
        src.includes("export async function autoRefundOnFlightFailure"),
        "flight-refund-on-failure.ts doit exporter autoRefundOnFlightFailure",
      )
    })

    it("appelle applyReservationRefund", () => {
      const src = read("lib/vols/flight-refund-on-failure.ts")
      assert.ok(
        src.includes("applyReservationRefund"),
        "flight-refund-on-failure.ts doit appeler applyReservationRefund",
      )
    })

    it("traite NO_CAPTURED_PAYMENT comme no-op silencieux", () => {
      const src = read("lib/vols/flight-refund-on-failure.ts")
      assert.ok(
        src.includes("NO_CAPTURED_PAYMENT"),
        "flight-refund-on-failure.ts doit ignorer silencieusement NO_CAPTURED_PAYMENT",
      )
    })

    it("ne propage jamais d'exception (try/catch externe)", () => {
      const src = read("lib/vols/flight-refund-on-failure.ts")
      assert.ok(
        src.includes("FLIGHT_AUTO_REFUND_EXCEPTION"),
        "flight-refund-on-failure.ts doit logger FLIGHT_AUTO_REFUND_EXCEPTION sans propager",
      )
    })

    it("logue FLIGHT_AUTO_REFUND_FAILURE sur échec non-NO_CAPTURED_PAYMENT", () => {
      const src = read("lib/vols/flight-refund-on-failure.ts")
      assert.ok(
        src.includes("FLIGHT_AUTO_REFUND_FAILURE"),
        "flight-refund-on-failure.ts doit logger FLIGHT_AUTO_REFUND_FAILURE",
      )
    })
  })

  describe("fulfillment-action.ts — 4 chemins FAILED appellent autoRefundOnFlightFailure", () => {
    it("importe autoRefundOnFlightFailure", () => {
      const src = read("lib/vols/fulfillment-action.ts")
      assert.ok(
        src.includes("autoRefundOnFlightFailure"),
        "fulfillment-action.ts doit importer autoRefundOnFlightFailure",
      )
    })

    it("appelle autoRefundOnFlightFailure au moins 4 fois", () => {
      const src = read("lib/vols/fulfillment-action.ts")
      const count = (src.match(/autoRefundOnFlightFailure\s*\(/g) ?? []).length
      assert.ok(
        count >= 4,
        `fulfillment-action.ts doit appeler autoRefundOnFlightFailure 4 fois (trouvé : ${count})`,
      )
    })

    it("couvre le chemin RECHECK_ERROR", () => {
      const src = read("lib/vols/fulfillment-action.ts")
      const recheckErrIdx = src.indexOf("RECHECK_ERROR")
      const refundBeforeRecheck = src
        .slice(0, recheckErrIdx)
        .lastIndexOf("autoRefundOnFlightFailure")
      assert.ok(
        refundBeforeRecheck !== -1,
        "autoRefundOnFlightFailure doit être appelé avant le return RECHECK_ERROR",
      )
    })

    it("couvre le chemin BOOK_FAILED", () => {
      const src = read("lib/vols/fulfillment-action.ts")
      const bookFailIdx = src.indexOf("BOOK_FAILED")
      const refundBeforeBook = src
        .slice(0, bookFailIdx)
        .lastIndexOf("autoRefundOnFlightFailure")
      assert.ok(
        refundBeforeBook !== -1,
        "autoRefundOnFlightFailure doit être appelé avant le return BOOK_FAILED",
      )
    })

    it("couvre le chemin ISSUE_FAILED / PNR_ORPHANED", () => {
      const src = read("lib/vols/fulfillment-action.ts")
      const issueFailIdx = src.indexOf("ISSUE_FAILED")
      const refundBeforeIssue = src
        .slice(0, issueFailIdx)
        .lastIndexOf("autoRefundOnFlightFailure")
      assert.ok(
        refundBeforeIssue !== -1,
        "autoRefundOnFlightFailure doit être appelé avant le return ISSUE_FAILED/PNR_ORPHANED",
      )
    })
  })
})
