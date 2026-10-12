/**
 * SETTLE-CANCEL-GUARD-01 — Invariants statiques : protection du settlement
 * contre les commissions de réservations annulées/remboursées.
 *
 * Ces tests vérifient statiquement (lecture du source) que :
 *  1. commission-settlement.ts importe `reservations` depuis @/lib/db/schema.
 *  2. Le filtre notCancelledFilter est défini et utilise reservations.status.
 *  3. settleCommissions() applique un leftJoin sur reservations.
 *  4. getUnsettledCommissionBalance() applique aussi ce leftJoin.
 *  5. Les statuts 'cancelled' et 'refunded' sont bien exclus.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

const src = readFileSync(
  join(process.cwd(), "lib/finance/commission-settlement.ts"),
  "utf8",
)

test("importe reservations depuis @/lib/db/schema", () => {
  assert.ok(
    src.includes("reservations") && src.includes("@/lib/db/schema"),
    "commission-settlement.ts doit importer reservations depuis @/lib/db/schema",
  )
})

test("définit notCancelledFilter avec reservations.status", () => {
  assert.ok(
    src.includes("notCancelledFilter"),
    "commission-settlement.ts doit définir notCancelledFilter",
  )
  assert.ok(
    src.includes("reservations.status"),
    "notCancelledFilter doit filtrer sur reservations.status",
  )
})

test("exclut les statuts cancelled et refunded", () => {
  assert.ok(
    src.includes('"cancelled"'),
    "doit exclure le statut cancelled",
  )
  assert.ok(
    src.includes('"refunded"'),
    "doit exclure le statut refunded",
  )
})

test("settleCommissions() applique leftJoin reservations", () => {
  const settleStart = src.indexOf("export async function settleCommissions")
  const settleEnd = src.indexOf("export async function markSettlementPaid")
  const settleBody = src.slice(settleStart, settleEnd)
  assert.ok(
    settleBody.includes("leftJoin") && settleBody.includes("reservations"),
    "settleCommissions() doit appliquer leftJoin reservations",
  )
})

test("getUnsettledCommissionBalance() applique leftJoin reservations", () => {
  const balanceStart = src.indexOf("export async function getUnsettledCommissionBalance")
  const balanceBody = src.slice(balanceStart)
  assert.ok(
    balanceBody.includes("leftJoin") && balanceBody.includes("reservations"),
    "getUnsettledCommissionBalance() doit appliquer leftJoin reservations",
  )
})

test("notCancelledFilter est appelé dans settleCommissions()", () => {
  const settleStart = src.indexOf("export async function settleCommissions")
  const settleEnd = src.indexOf("export async function markSettlementPaid")
  const settleBody = src.slice(settleStart, settleEnd)
  const occurrences = (settleBody.match(/notCancelledFilter/g) || []).length
  assert.ok(
    occurrences >= 2,
    `notCancelledFilter doit être appelé au moins 2× dans settleCommissions() (summary + entries), trouvé: ${occurrences}`,
  )
})

test("notCancelledFilter est appelé dans getUnsettledCommissionBalance()", () => {
  const balanceStart = src.indexOf("export async function getUnsettledCommissionBalance")
  const balanceBody = src.slice(balanceStart)
  assert.ok(
    balanceBody.includes("notCancelledFilter()"),
    "getUnsettledCommissionBalance() doit appeler notCancelledFilter()",
  )
})
