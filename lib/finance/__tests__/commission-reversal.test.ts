/**
 * CANCEL-COMMISSION-01 — Tests unitaires : reverseCommissionOnCancellation.
 *
 * Couvre :
 *  1.  No-op silencieux quand pas de ligne reservation_financials.
 *  2.  No-op silencieux quand commissionAmount <= 0.
 *  3.  No-op silencieux quand commissionAmount = null.
 *  4.  No-op + warn quand entitlement original absent (wallet PAS débité).
 *  5.  Appel à debit_platform_commission() quand entitlement trouvé et amount > 0.
 *  6.  Clé d'idempotence = 'commission-reversal:{reservationId}'.
 *  7.  Insertion compensatoire economic_entitlements quand entitlement original trouvé.
 *  8.  Pas d'insertion compensatoire et pas de débit quand entitlement absent.
 *  9.  Défaut full_reversal — montant = |originalEntitlement.amount|, PAS commissionAmount.
 *  10. non_refundable → ZÉRO débit wallet, compensation traçabilité = 0.00.
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
  | { id: string; amount: string; cancellationTreatment: string | null }
  | null

function makeMockTx(opts: {
  financialsRow: { commissionAmount: string | null } | null
  originalEntitlement: { id: string; amount: string; cancellationTreatment: string | null } | null
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

test("no-op + pas de débit — entitlement original absent (commissionAmount > 0)", async () => {
  // Même si reservation_financials indique une commission, l'absence d'entitlement
  // d'origine signifie qu'on ne peut pas vérifier le crédit initial — on ne débite pas.
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-4",
    publicRef: "REF-004",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0, "wallet ne doit pas être débité si entitlement absent")
  assert.strictEqual(getInsertValues().length, 0, "ne doit pas insérer de ligne compensatoire si entitlement absent")
})

test("appelle debit_platform_commission quand entitlement trouvé et amount > 0", async () => {
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "15.50" },
    originalEntitlement: { id: "orig-ent-5", amount: "15.50", cancellationTreatment: null },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-5",
    publicRef: "REF-005",
    actorUserId: "admin-1",
  })

  assert.strictEqual(getExecuteCalls().length, 1, "doit appeler tx.execute() une fois pour debit_platform_commission")
  const sqlStr = JSON.stringify(getExecuteCalls()[0])
  assert.ok(
    sqlStr.includes("debit_platform_commission"),
    "doit appeler debit_platform_commission",
  )
})

test("clé d'idempotence = 'commission-reversal:{reservationId}'", async () => {
  const reservationId = "aaa-bbb-ccc-ddd"
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "10.00" },
    originalEntitlement: { id: "orig-ent-6", amount: "10.00", cancellationTreatment: null },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId,
    publicRef: "REF-006",
    actorUserId: null,
  })

  const call = JSON.stringify(getExecuteCalls()[0])
  const expectedKey = `commission-reversal:${reservationId}`
  assert.ok(call.includes(expectedKey), `la clé d'idempotence doit être '${expectedKey}', reçu: ${call}`)
})

test("insère ligne compensatoire economic_entitlements quand entitlement original trouvé", async () => {
  const { tx, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: { id: "orig-ent-id", amount: "20.00", cancellationTreatment: null },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-7",
    publicRef: "REF-007",
    actorUserId: null,
  })

  assert.strictEqual(getInsertValues().length, 1, "doit insérer exactement une ligne compensatoire")
  const row = getInsertValues()[0]
  assert.strictEqual(row.qualification, "commission")
  assert.strictEqual(row.partyType, "easy2book")
  assert.strictEqual(row.compensatesId, "orig-ent-id")
})

test("pas d'insertion compensatoire et pas de débit quand entitlement original absent", async () => {
  const { tx, getInsertValues, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-8",
    publicRef: "REF-008",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0, "wallet ne doit pas être débité si entitlement absent")
  assert.strictEqual(getInsertValues().length, 0, "ne doit pas insérer de ligne compensatoire si pas d'entitlement original")
})

test("full_reversal — amount = -|originalEntitlement.amount|, pas commissionAmount", async () => {
  // commissionAmount (35.00) diffère volontairement de l'entitlement (30.00)
  // pour vérifier que c'est bien l'entitlement qui fait foi.
  const { tx, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "35.00" },
    originalEntitlement: { id: "orig-id", amount: "30.00", cancellationTreatment: null },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-9",
    publicRef: "REF-009",
    actorUserId: null,
  })

  const row = getInsertValues()[0]
  assert.strictEqual(row.amount, "-30.00", "full_reversal doit inverser le montant de l'entitlement d'origine (30.00), pas commissionAmount (35.00)")
  assert.strictEqual(row.cancellationTreatment, "full_reversal")
})

test("non_refundable → ZÉRO débit wallet, compensatoire traçabilité = 0.00", async () => {
  // La commission est méritée même en annulation — le wallet NE DOIT PAS être débité.
  const { tx, getInsertValues, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "25.00" },
    originalEntitlement: { id: "orig-id-2", amount: "25.00", cancellationTreatment: "non_refundable" },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-10",
    publicRef: "REF-010",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0, "non_refundable : wallet commission ne doit PAS être débité")
  assert.strictEqual(getInsertValues().length, 1, "doit insérer une ligne de traçabilité")
  const row = getInsertValues()[0]
  assert.strictEqual(row.amount, "0.00", "non_refundable : amount compensatoire doit être 0.00")
  assert.strictEqual(row.cancellationTreatment, "non_refundable")
})
