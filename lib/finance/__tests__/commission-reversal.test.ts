/**
 * CANCEL-COMMISSION-01 — Tests unitaires : reverseCommissionOnCancellation.
 *
 * Couvre :
 *  1.  No-op quand pas de ligne reservation_financials.
 *  2.  No-op quand commissionAmount <= 0.
 *  3.  No-op quand commissionAmount = null.
 *  4.  No-op + warn quand entitlement absent (wallet PAS débité).
 *  5.  No-op + warn quand crédit wallet_ledger absent (entitlement présent).
 *  6.  Appel à debit_platform_commission() quand toutes les données sont présentes.
 *  7.  Clé d'idempotence = 'commission-reversal:{reservationId}'.
 *  8.  Insertion compensatoire quand entitlement + crédit wallet présents.
 *  9.  full_reversal — montant = creditEntry.amount (écriture réelle wallet),
 *      PAS reservationFinancials.commissionAmount.
 *  10. non_refundable → ZÉRO débit wallet, compensatoire traçabilité = 0.00.
 *  11. pro_rata_fee → throw explicite (politique non validée par Direction).
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
  | { commissionAmount: string | null }       // reservationFinancials
  | { id: string; cancellationTreatment: string | null } // economicEntitlements
  | { amount: string }                         // walletLedger (crédit réel)
  | null

function makeMockTx(opts: {
  financialsRow: { commissionAmount: string | null } | null
  originalEntitlement: { id: string; cancellationTreatment: string | null } | null
  /** Entrée wallet_ledger (type='commission', category='commission') du crédit initial. */
  creditLedgerEntry: { amount: string } | null
}) {
  const executeCalls: unknown[] = []
  const insertValues: Record<string, unknown>[] = []
  let selectCallIndex = 0

  const selectResults: (MockSelectResult | null)[] = [
    opts.financialsRow,
    opts.originalEntitlement,
    opts.creditLedgerEntry,
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
    creditLedgerEntry: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-1",
    publicRef: "REF-001",
    actorUserId: "user-1",
  })

  assert.strictEqual(getExecuteCalls().length, 0)
  assert.strictEqual(getInsertValues().length, 0)
})

test("no-op silencieux — commissionAmount = '0.00'", async () => {
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "0.00" },
    originalEntitlement: null,
    creditLedgerEntry: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-2",
    publicRef: "REF-002",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0)
})

test("no-op silencieux — commissionAmount = null", async () => {
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: null },
    originalEntitlement: null,
    creditLedgerEntry: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-3",
    publicRef: "REF-003",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0)
})

test("no-op + pas de débit — entitlement original absent", async () => {
  // reservation_financials indique une commission, mais sans entitlement on ne
  // peut pas vérifier que la commission a été comptabilisée → on s'abstient.
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: null,
    creditLedgerEntry: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-4",
    publicRef: "REF-004",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0, "wallet ne doit pas être débité si entitlement absent")
  assert.strictEqual(getInsertValues().length, 0, "ne doit pas insérer de ligne compensatoire si entitlement absent")
})

test("no-op + pas de débit — crédit wallet_ledger absent (entitlement présent)", async () => {
  // Entitlement comptable présent mais aucun crédit correspondant dans wallet_ledger :
  // la commission n'a jamais été versée au wallet → pas de débit.
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: { id: "orig-ent-id", cancellationTreatment: null },
    creditLedgerEntry: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-5",
    publicRef: "REF-005",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0, "wallet ne doit pas être débité si crédit ledger absent")
  assert.strictEqual(getInsertValues().length, 0)
})

test("appelle debit_platform_commission quand toutes les données sont présentes", async () => {
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "15.50" },
    originalEntitlement: { id: "orig-ent-6", cancellationTreatment: null },
    creditLedgerEntry: { amount: "15.50" },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-6",
    publicRef: "REF-006",
    actorUserId: "admin-1",
  })

  assert.strictEqual(getExecuteCalls().length, 1, "doit appeler tx.execute() une fois pour debit_platform_commission")
  const sqlStr = JSON.stringify(getExecuteCalls()[0])
  assert.ok(sqlStr.includes("debit_platform_commission"), "doit appeler debit_platform_commission")
})

test("clé d'idempotence = 'commission-reversal:{reservationId}'", async () => {
  const reservationId = "aaa-bbb-ccc-ddd"
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "10.00" },
    originalEntitlement: { id: "orig-ent-7", cancellationTreatment: null },
    creditLedgerEntry: { amount: "10.00" },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId,
    publicRef: "REF-007",
    actorUserId: null,
  })

  const call = JSON.stringify(getExecuteCalls()[0])
  const expectedKey = `commission-reversal:${reservationId}`
  assert.ok(call.includes(expectedKey), `clé d'idempotence attendue: '${expectedKey}', reçu: ${call}`)
})

test("insère ligne compensatoire economic_entitlements", async () => {
  const { tx, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: { id: "orig-ent-id", cancellationTreatment: null },
    creditLedgerEntry: { amount: "20.00" },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-8",
    publicRef: "REF-008",
    actorUserId: null,
  })

  assert.strictEqual(getInsertValues().length, 1, "doit insérer exactement une ligne compensatoire")
  const row = getInsertValues()[0]
  assert.strictEqual(row.qualification, "commission")
  assert.strictEqual(row.partyType, "easy2book")
  assert.strictEqual(row.compensatesId, "orig-ent-id")
})

test("full_reversal — montant = creditEntry.amount (écriture wallet réelle), pas financials ni entitlement", async () => {
  // Les trois sources ont des valeurs DIFFÉRENTES pour prouver laquelle fait foi.
  // financials.commissionAmount = 35.00  ← ignoré (garde rapide uniquement)
  // creditLedgerEntry.amount    = 30.00  ← source authoritative
  // → compensatoire attendu = -30.00
  const { tx, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "35.00" },
    originalEntitlement: { id: "orig-id", cancellationTreatment: null },
    creditLedgerEntry: { amount: "30.00" },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-9",
    publicRef: "REF-009",
    actorUserId: null,
  })

  const row = getInsertValues()[0]
  assert.strictEqual(row.amount, "-30.00", "doit utiliser creditEntry.amount (30.00), pas financials (35.00)")
  assert.strictEqual(row.cancellationTreatment, "full_reversal")
})

test("non_refundable → ZÉRO débit wallet, compensatoire traçabilité = 0.00", async () => {
  // Commission méritée même en annulation : wallet PAS débité.
  // On n'a pas besoin de vérifier wallet_ledger puisqu'on ne débite pas.
  const { tx, getInsertValues, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "25.00" },
    originalEntitlement: { id: "orig-id-2", cancellationTreatment: "non_refundable" },
    creditLedgerEntry: null, // non consulté pour non_refundable
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-10",
    publicRef: "REF-010",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0, "non_refundable : wallet commission NE DOIT PAS être débité")
  assert.strictEqual(getInsertValues().length, 1, "doit insérer une ligne de traçabilité")
  const row = getInsertValues()[0]
  assert.strictEqual(row.amount, "0.00", "non_refundable : amount compensatoire = 0.00")
  assert.strictEqual(row.cancellationTreatment, "non_refundable")
})

test("pro_rata_fee → throw explicite (politique non validée par Direction)", async () => {
  // pro_rata_fee ne doit PAS silencieusement retomber sur full_reversal :
  // le système doit refuser une politique financière non définie.
  const { tx } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: { id: "orig-id-3", cancellationTreatment: "pro_rata_fee" },
    creditLedgerEntry: null, // non consulté — le throw intervient avant
  })

  await assert.rejects(
    () =>
      reverseCommissionOnCancellation(tx, {
        reservationId: "res-11",
        publicRef: "REF-011",
        actorUserId: null,
      }),
    (err: Error) => {
      assert.ok(
        err.message.includes("COMMISSION_REVERSAL_PRO_RATA_NOT_VALIDATED"),
        `doit throw avec COMMISSION_REVERSAL_PRO_RATA_NOT_VALIDATED, reçu: ${err.message}`,
      )
      return true
    },
  )
})
