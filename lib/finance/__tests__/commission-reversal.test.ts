/**
 * CANCEL-COMMISSION-01 — Tests unitaires : reverseCommissionOnCancellation.
 *
 * Couvre :
 *  1. No-op silencieux quand pas de ligne reservation_financials.
 *  2. No-op silencieux quand commissionAmount <= 0.
 *  3. Appel à debit_platform_commission() quand commissionAmount > 0.
 *  4. Clé d'idempotence = 'commission-reversal:{reservationId}'.
 *  5. Insertion compensatoire economic_entitlements quand entitlement original trouvé.
 *  6. Pas d'insertion compensatoire quand entitlement original absent.
 *  7. Défaut full_reversal quand cancellationTreatment = null.
 *  8. non_refundable → amount compensatoire = 0 (pas de remboursement commission).
 *
 * Pas de DB réelle — mock tx minimal.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { reverseCommissionOnCancellation } from "@/lib/finance/commission-reversal"
import type { DrizzleTransaction } from "@/lib/db/client"

/* -------------------------------------------------------------------------- */
/* Helpers mock                                                                 */
/* -------------------------------------------------------------------------- */

type MockSelectResult =
  | { commissionAmount: string | null }
  | { id: string; cancellationTreatment: string | null }
  | null

function makeMockTx(opts: {
  financialsRow: { commissionAmount: string | null } | null
  originalEntitlement: { id: string; cancellationTreatment: string | null } | null
}) {
  const executeCalls: unknown[] = []
  const insertValues: Record<string, unknown>[] = []
  let selectCallIndex = 0

  const selectResults: (MockSelectResult | null)[] = [
    opts.financialsRow,
    opts.originalEntitlement,
  ]

  const tx = {
    select: (_cols: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          limit: (_n: number) => {
            const result = selectResults[selectCallIndex++]
            return Promise.resolve(result ? [result] : [])
          },
        }),
      }),
    }),
    execute: async (query: unknown) => {
      executeCalls.push(query)
    },
    insert: (_table: unknown) => ({
      values: (row: Record<string, unknown>) => {
        insertValues.push(row)
        return Promise.resolve()
      },
    }),
  } as unknown as DrizzleTransaction

  return {
    tx,
    getExecuteCalls: () => executeCalls,
    getInsertValues: () => insertValues,
  }
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                        */
/* -------------------------------------------------------------------------- */

test("no-op silencieux — pas de ligne reservation_financials", async () => {
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: null,
    originalEntitlement: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-1",
    publicRef: "REF-001",
    actorUserId: "user-1",
  })

  assert.strictEqual(getExecuteCalls().length, 0, "ne doit pas appeler debit_platform_commission")
  assert.strictEqual(getInsertValues().length, 0, "ne doit pas insérer d'entitlement compensatoire")
})

test("no-op silencieux — commissionAmount = '0.00'", async () => {
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "0.00" },
    originalEntitlement: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-2",
    publicRef: "REF-002",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0, "ne doit pas appeler debit_platform_commission pour commissionAmount=0")
})

test("no-op silencieux — commissionAmount = null", async () => {
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: null },
    originalEntitlement: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-3",
    publicRef: "REF-003",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0)
})

test("appelle debit_platform_commission quand commissionAmount > 0", async () => {
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "15.50" },
    originalEntitlement: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-4",
    publicRef: "REF-004",
    actorUserId: "admin-1",
  })

  assert.strictEqual(getExecuteCalls().length, 1, "doit appeler tx.execute() une fois pour debit_platform_commission")
  const sqlStr = String(getExecuteCalls()[0])
  assert.ok(sqlStr.includes("debit_platform_commission") || JSON.stringify(getExecuteCalls()[0]).includes("debit_platform_commission"),
    "doit appeler debit_platform_commission")
})

test("clé d'idempotence = 'commission-reversal:{reservationId}'", async () => {
  const reservationId = "aaa-bbb-ccc-ddd"
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "10.00" },
    originalEntitlement: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId,
    publicRef: "REF-005",
    actorUserId: null,
  })

  const call = JSON.stringify(getExecuteCalls()[0])
  const expectedKey = `commission-reversal:${reservationId}`
  assert.ok(call.includes(expectedKey), `la clé d'idempotence doit être '${expectedKey}', reçu: ${call}`)
})

test("insère ligne compensatoire economic_entitlements quand entitlement original trouvé", async () => {
  const { tx, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: { id: "orig-ent-id", cancellationTreatment: null },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-6",
    publicRef: "REF-006",
    actorUserId: null,
  })

  assert.strictEqual(getInsertValues().length, 1, "doit insérer exactement une ligne compensatoire")
  const row = getInsertValues()[0]
  assert.strictEqual(row.qualification, "commission")
  assert.strictEqual(row.partyType, "easy2book")
  assert.strictEqual(row.compensatesId, "orig-ent-id")
})

test("pas d'insertion compensatoire quand entitlement original absent", async () => {
  const { tx, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-7",
    publicRef: "REF-007",
    actorUserId: null,
  })

  assert.strictEqual(getInsertValues().length, 0, "ne doit pas insérer de ligne compensatoire si pas d'entitlement original")
})

test("défaut full_reversal — amount = -commissionAmount", async () => {
  const { tx, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "30.00" },
    originalEntitlement: { id: "orig-id", cancellationTreatment: null },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-8",
    publicRef: "REF-008",
    actorUserId: null,
  })

  const row = getInsertValues()[0]
  assert.strictEqual(row.amount, "-30.00", "full_reversal doit inverser la commission")
  assert.strictEqual(row.cancellationTreatment, "full_reversal")
})

test("non_refundable → amount compensatoire = 0.00", async () => {
  const { tx, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "25.00" },
    originalEntitlement: { id: "orig-id-2", cancellationTreatment: "non_refundable" },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-9",
    publicRef: "REF-009",
    actorUserId: null,
  })

  const row = getInsertValues()[0]
  assert.strictEqual(row.amount, "0.00", "non_refundable : amount compensatoire doit être 0.00")
  assert.strictEqual(row.cancellationTreatment, "non_refundable")
})
