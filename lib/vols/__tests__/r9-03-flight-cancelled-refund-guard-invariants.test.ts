/**
 * R9-03 — Invariants statiques : trou latent fermé sur le statut vol
 * "CANCELLED" (FLIGHT-CANCELLED-REFUND-GUARD-01)
 *
 * Contexte : aucun appelant réel ne passe aujourd'hui "CANCELLED" à
 * updateFlightStatus() (seul "FAILED" est utilisé, déjà couvert par
 * FLIGHT-REFUND-GAP-01 / R9-01). Mais la state machine (flight-status-utils.ts)
 * mappe "CANCELLED" vers le même statut réservation "cancelled" que "FAILED" —
 * sans ce garde-fou, un futur appelant (ex. webhook d'annulation GDS) qui
 * passerait "CANCELLED" sauterait silencieusement le remboursement et le
 * reversement de commission.
 *
 * Vérifie que :
 * 1. flight-status-sync.ts importe et appelle autoRefundOnFlightFailure.
 * 2. Le déclenchement est conditionné sur newStatus === "CANCELLED".
 * 3. L'appel se situe dans la branche où updateFlightStatus gère sa propre
 *    transaction (après withSystemContext(run)), jamais à l'intérieur de
 *    `run` — pour ne jamais imbriquer deux transactions/connexions.
 * 4. agencyId est bien lu depuis `reservations` (nécessaire à l'appel).
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import assert from "node:assert/strict"

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8")
}

describe("R9-03 — Garde-fou remboursement vol CANCELLED (FLIGHT-CANCELLED-REFUND-GUARD-01)", () => {
  const src = read("lib/vols/flight-status-sync.ts")

  it("importe autoRefundOnFlightFailure", () => {
    assert.ok(
      src.includes("import { autoRefundOnFlightFailure } from \"./flight-refund-on-failure\""),
      "flight-status-sync.ts doit importer autoRefundOnFlightFailure depuis ./flight-refund-on-failure",
    )
  })

  it("lit agencyId depuis reservations", () => {
    assert.ok(
      /reservations\.agencyId/.test(src),
      "flight-status-sync.ts doit sélectionner reservations.agencyId (requis par autoRefundOnFlightFailure)",
    )
  })

  it("conditionne le remboursement sur newStatus === \"CANCELLED\"", () => {
    assert.ok(
      src.includes('newStatus === "CANCELLED" && current?.agencyId'),
      "le déclenchement doit être conditionné sur newStatus === \"CANCELLED\" et la présence d'agencyId",
    )
  })

  it("appelle autoRefundOnFlightFailure après withSystemContext(run), jamais dans run()", () => {
    const withSystemContextIdx = src.indexOf("await withSystemContext(run)")
    const refundCallIdx = src.indexOf("await autoRefundOnFlightFailure(")
    assert.ok(withSystemContextIdx !== -1, "withSystemContext(run) doit être présent")
    assert.ok(refundCallIdx !== -1, "autoRefundOnFlightFailure doit être appelé")
    assert.ok(
      refundCallIdx > withSystemContextIdx,
      "autoRefundOnFlightFailure doit être appelé APRÈS withSystemContext(run) (transaction déjà committée), jamais imbriqué dans run()",
    )
  })

  it("run() retourne la donnée de remboursement au lieu de muter une variable fermée (pas de closure partagée entre run et l'appelant)", () => {
    assert.ok(
      /return \{ reservationId: row\.reservationId, agencyId: current\.agencyId \}/.test(
        src,
      ),
      "run() doit retourner { reservationId, agencyId } plutôt que d'assigner une variable externe",
    )
  })

  it("ne déclenche jamais le remboursement quand un tx externe est fourni (if (tx) { await run(tx) } ne contient pas l'appel)", () => {
    const ifTxIdx = src.indexOf("if (tx) {")
    const elseIdx = src.indexOf("} else {")
    const refundCallIdx = src.indexOf("await autoRefundOnFlightFailure(")
    assert.ok(ifTxIdx !== -1 && elseIdx !== -1, "structure if (tx) {...} else {...} doit être présente")
    assert.ok(
      refundCallIdx > elseIdx,
      "autoRefundOnFlightFailure doit être dans la branche else (tx géré en interne), jamais dans la branche if (tx) externe",
    )
  })

  it("passe actorUserId: null (automatisé, pas d'acteur humain)", () => {
    assert.ok(
      /autoRefundOnFlightFailure\(\{[\s\S]{0,200}actorUserId:\s*null/.test(src),
      "l'appel automatisé doit passer actorUserId: null",
    )
  })
})
