/**
 * CANCEL-COMMISSION-01 — Tests unitaires : reverseCommissionOnCancellation.
 *
 * Couvre (audit PR #200, 2026-10-12) :
 *  1.  No-op quand pas de ligne reservation_financials.
 *  2.  No-op quand commissionAmount <= 0.
 *  3.  No-op quand commissionAmount = null.
 *  4.  No-op + warn quand entitlement absent (wallet PAS débité).
 *  5.  Politique absente (cancellationTreatment=null) → SKIP, pas de défaut
 *      full_reversal inventé (correctif Bloquant B).
 *  6.  Politique inconnue (chaîne non reconnue) → SKIP, même traitement.
 *  7.  full_reversal explicite → debit_platform_commission() appelé.
 *  8.  Clé d'idempotence = 'commission-reversal:{reservationId}'.
 *  9.  Insertion compensatoire quand entitlement + crédit wallet présents.
 *  10. full_reversal — montant = creditEntry.amount (écriture réelle wallet),
 *      PAS reservationFinancials.commissionAmount.
 *  11. non_refundable → ZÉRO débit wallet, compensatoire traçabilité = 0.00.
 *  12. pro_rata_fee → throw explicite (politique non validée par Direction).
 *  13. No-op + warn quand crédit wallet_ledger absent (entitlement présent).
 *  14. Idempotence bout-en-bout : compensation déjà existante avec le MÊME
 *      traitement → no-op total (aucun débit, aucun second insert).
 *  15. Incohérence : compensation déjà existante avec un traitement
 *      DIFFÉRENT → throw explicite (jamais une correction silencieuse).
 *  16. Ambiguïté : 2 compensations déjà existantes pour le même entitlement
 *      → skip + warn (jamais un choix arbitraire).
 *  17. Ambiguïté : 2 crédits wallet_ledger candidats → skip + warn (jamais
 *      le premier résultat SQL choisi arbitrairement).
 *  18. Course perdue (23505 sur l'INSERT compensatoire, full_reversal) →
 *      absorbée silencieusement, jamais une erreur remontée.
 *  19. Course perdue (23505 sur l'INSERT compensatoire, non_refundable) →
 *      même traitement.
 *  20. negateDecimalString : inversion de signe par chaîne, pas de passage
 *      par un float (ex. "10.10" → "-10.10" exact).
 *
 * Pas de DB réelle — mock tx minimal. Les garanties PostgreSQL réelles
 * (FOR UPDATE, contrainte UNIQUE, concurrence réelle) nécessitent un
 * environnement d'intégration séparé — voir rapport d'audit PR #200,
 * section tests d'intégration.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { reverseCommissionOnCancellation } from "@/lib/finance/commission-reversal"
import type { DrizzleTransaction } from "@/lib/db/client"

/* -------------------------------------------------------------------------- */
/* Helpers mock                                                                 */
/* -------------------------------------------------------------------------- */

type EntitlementRow = { id: string; cancellationTreatment: string | null }

/** Erreur imitant une violation de contrainte UNIQUE Postgres (23505),
 * exactement la forme que `pgErrorCode()` (lib/db/pg-error.ts) sait lire :
 * le code réel vit sur `.cause.code`, pas directement sur l'erreur. */
class MockUniqueViolation extends Error {
  cause = { code: "23505" }
}

function makeMockTx(opts: {
  financialsRow: { commissionAmount: string | null } | null
  originalEntitlement: EntitlementRow | null
  /** NOUVEAU (Bloquant A) : compensation(s) déjà existante(s) pour cet entitlement. */
  existingCompensations?: EntitlementRow[]
  /** Entrée(s) wallet_ledger (type='commission', category='commission') du crédit initial. */
  creditLedgerEntries?: { amount: string }[]
  /** Si true, le prochain INSERT economic_entitlements rejette avec 23505. */
  insertThrowsUniqueViolation?: boolean
}) {
  const executeCalls: unknown[] = []
  const insertValues: Record<string, unknown>[] = []
  let selectCallIndex = 0

  const selectResults: unknown[][] = [
    opts.financialsRow ? [opts.financialsRow] : [],
    opts.originalEntitlement ? [opts.originalEntitlement] : [],
    opts.existingCompensations ?? [],
    opts.creditLedgerEntries ?? [],
  ]

  const tx = {
    select: (_cols: unknown) => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          limit: (_n: number) => {
            const result = selectResults[selectCallIndex++] ?? []
            return Promise.resolve(result)
          },
        }),
      }),
    }),
    execute: async (query: unknown) => {
      executeCalls.push(query)
    },
    insert: (_table: unknown) => ({
      values: (row: Record<string, unknown>) => {
        if (opts.insertThrowsUniqueViolation) {
          return Promise.reject(new MockUniqueViolation("duplicate key"))
        }
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
/* 1-4. Gardes rapides (comportement préexistant, inchangé)                   */
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

  assert.strictEqual(getExecuteCalls().length, 0)
  assert.strictEqual(getInsertValues().length, 0)
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

  assert.strictEqual(getExecuteCalls().length, 0)
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

test("no-op + pas de débit — entitlement original absent", async () => {
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: null,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-4",
    publicRef: "REF-004",
    actorUserId: null,
  })

  assert.strictEqual(
    getExecuteCalls().length,
    0,
    "wallet ne doit pas être débité si entitlement absent",
  )
  assert.strictEqual(
    getInsertValues().length,
    0,
    "ne doit pas insérer de ligne compensatoire si entitlement absent",
  )
})

/* -------------------------------------------------------------------------- */
/* 5-6. BLOQUANT B — politique absente/inconnue : SKIP, jamais un défaut      */
/* -------------------------------------------------------------------------- */

test("BLOQUANT B — cancellationTreatment=null → SKIP (pas de défaut full_reversal inventé)", async () => {
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: { id: "orig-id", cancellationTreatment: null },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-5",
    publicRef: "REF-005",
    actorUserId: null,
  })

  assert.strictEqual(
    getExecuteCalls().length,
    0,
    "politique absente : AUCUN débit, jamais un full_reversal par défaut",
  )
  assert.strictEqual(
    getInsertValues().length,
    0,
    "politique absente : AUCUNE compensation insérée",
  )
})

test("BLOQUANT B — cancellationTreatment inconnu ('bogus') → SKIP", async () => {
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: { id: "orig-id", cancellationTreatment: "bogus" },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-5b",
    publicRef: "REF-005B",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0)
  assert.strictEqual(getInsertValues().length, 0)
})

/* -------------------------------------------------------------------------- */
/* 7-10. full_reversal explicite (comportement nominal)                       */
/* -------------------------------------------------------------------------- */

test("no-op + pas de débit — crédit wallet_ledger absent (entitlement présent)", async () => {
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: {
      id: "orig-ent-id",
      cancellationTreatment: "full_reversal",
    },
    creditLedgerEntries: [],
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-6",
    publicRef: "REF-006",
    actorUserId: null,
  })

  assert.strictEqual(
    getExecuteCalls().length,
    0,
    "wallet ne doit pas être débité si crédit ledger absent",
  )
  assert.strictEqual(getInsertValues().length, 0)
})

test("appelle debit_platform_commission quand toutes les données sont présentes", async () => {
  const { tx, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "15.50" },
    originalEntitlement: {
      id: "orig-ent-6",
      cancellationTreatment: "full_reversal",
    },
    creditLedgerEntries: [{ amount: "15.50" }],
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-7",
    publicRef: "REF-007",
    actorUserId: "admin-1",
  })

  assert.strictEqual(
    getExecuteCalls().length,
    1,
    "doit appeler tx.execute() une fois pour debit_platform_commission",
  )
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
    originalEntitlement: {
      id: "orig-ent-7",
      cancellationTreatment: "full_reversal",
    },
    creditLedgerEntries: [{ amount: "10.00" }],
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId,
    publicRef: "REF-008",
    actorUserId: null,
  })

  const call = JSON.stringify(getExecuteCalls()[0])
  const expectedKey = `commission-reversal:${reservationId}`
  assert.ok(
    call.includes(expectedKey),
    `clé d'idempotence attendue: '${expectedKey}', reçu: ${call}`,
  )
})

test("insère ligne compensatoire economic_entitlements", async () => {
  const { tx, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: {
      id: "orig-ent-id",
      cancellationTreatment: "full_reversal",
    },
    creditLedgerEntries: [{ amount: "20.00" }],
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-9",
    publicRef: "REF-009",
    actorUserId: null,
  })

  assert.strictEqual(
    getInsertValues().length,
    1,
    "doit insérer exactement une ligne compensatoire",
  )
  const row = getInsertValues()[0]
  assert.strictEqual(row.qualification, "commission")
  assert.strictEqual(row.partyType, "easy2book")
  assert.strictEqual(row.compensatesId, "orig-ent-id")
})

test("full_reversal — montant = creditEntry.amount (écriture wallet réelle), pas financials ni entitlement", async () => {
  // Les deux sources ont des valeurs DIFFÉRENTES pour prouver laquelle fait foi.
  // financials.commissionAmount = 35.00  ← ignoré (garde rapide uniquement)
  // creditLedgerEntries[0].amount = 30.00  ← source authoritative
  // → compensatoire attendu = -30.00
  const { tx, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "35.00" },
    originalEntitlement: {
      id: "orig-id",
      cancellationTreatment: "full_reversal",
    },
    creditLedgerEntries: [{ amount: "30.00" }],
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-10",
    publicRef: "REF-010",
    actorUserId: null,
  })

  const row = getInsertValues()[0]
  assert.strictEqual(
    row.amount,
    "-30.00",
    "doit utiliser creditEntry.amount (30.00), pas financials (35.00)",
  )
  assert.strictEqual(row.cancellationTreatment, "full_reversal")
})

/* -------------------------------------------------------------------------- */
/* 11-12. non_refundable / pro_rata_fee (comportement préexistant)            */
/* -------------------------------------------------------------------------- */

test("non_refundable → ZÉRO débit wallet, compensatoire traçabilité = 0.00", async () => {
  const { tx, getInsertValues, getExecuteCalls } = makeMockTx({
    financialsRow: { commissionAmount: "25.00" },
    originalEntitlement: {
      id: "orig-id-2",
      cancellationTreatment: "non_refundable",
    },
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-11",
    publicRef: "REF-011",
    actorUserId: null,
  })

  assert.strictEqual(
    getExecuteCalls().length,
    0,
    "non_refundable : wallet commission NE DOIT PAS être débité",
  )
  assert.strictEqual(
    getInsertValues().length,
    1,
    "doit insérer une ligne de traçabilité",
  )
  const row = getInsertValues()[0]
  assert.strictEqual(
    row.amount,
    "0.00",
    "non_refundable : amount compensatoire = 0.00",
  )
  assert.strictEqual(row.cancellationTreatment, "non_refundable")
})

test("pro_rata_fee → throw explicite (politique non validée par Direction)", async () => {
  const { tx } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: {
      id: "orig-id-3",
      cancellationTreatment: "pro_rata_fee",
    },
  })

  await assert.rejects(
    () =>
      reverseCommissionOnCancellation(tx, {
        reservationId: "res-12",
        publicRef: "REF-012",
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

/* -------------------------------------------------------------------------- */
/* 14-17. BLOQUANT A — idempotence bout-en-bout + ambiguïté                   */
/* -------------------------------------------------------------------------- */

test("BLOQUANT A — retry idempotent : compensation déjà existante, MÊME traitement → no-op total", async () => {
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: {
      id: "orig-id-4",
      cancellationTreatment: "full_reversal",
    },
    existingCompensations: [
      { id: "comp-1", cancellationTreatment: "full_reversal" },
    ],
    // creditLedgerEntries jamais consulté — on retourne avant d'y arriver.
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-13",
    publicRef: "REF-013",
    actorUserId: null,
  })

  assert.strictEqual(
    getExecuteCalls().length,
    0,
    "retry idempotent : AUCUN second débit",
  )
  assert.strictEqual(
    getInsertValues().length,
    0,
    "retry idempotent : AUCUNE seconde compensation insérée",
  )
})

test("BLOQUANT A — retry avec traitement INCOMPATIBLE → throw explicite", async () => {
  const { tx } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: {
      id: "orig-id-5",
      cancellationTreatment: "non_refundable",
    },
    existingCompensations: [
      { id: "comp-2", cancellationTreatment: "full_reversal" },
    ],
  })

  await assert.rejects(
    () =>
      reverseCommissionOnCancellation(tx, {
        reservationId: "res-14",
        publicRef: "REF-014",
        actorUserId: null,
      }),
    (err: Error) => {
      assert.ok(
        err.message.includes("COMMISSION_REVERSAL_INCONSISTENT_RETRY"),
        `doit throw avec COMMISSION_REVERSAL_INCONSISTENT_RETRY, reçu: ${err.message}`,
      )
      return true
    },
  )
})

test("BLOQUANT A — 2 compensations déjà existantes (ambigu) → skip + warn, jamais un choix arbitraire", async () => {
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: {
      id: "orig-id-6",
      cancellationTreatment: "full_reversal",
    },
    existingCompensations: [
      { id: "comp-3", cancellationTreatment: "full_reversal" },
      { id: "comp-4", cancellationTreatment: "full_reversal" },
    ],
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-15",
    publicRef: "REF-015",
    actorUserId: null,
  })

  assert.strictEqual(getExecuteCalls().length, 0)
  assert.strictEqual(getInsertValues().length, 0)
})

test("BLOQUANT C — 2 crédits wallet_ledger candidats (ambigu) → skip + warn, jamais le premier résultat SQL", async () => {
  const { tx, getExecuteCalls, getInsertValues } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: {
      id: "orig-id-7",
      cancellationTreatment: "full_reversal",
    },
    creditLedgerEntries: [{ amount: "20.00" }, { amount: "20.00" }],
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-16",
    publicRef: "REF-016",
    actorUserId: null,
  })

  assert.strictEqual(
    getExecuteCalls().length,
    0,
    "ambigu : AUCUN débit tant que non résolu",
  )
  assert.strictEqual(getInsertValues().length, 0)
})

/* -------------------------------------------------------------------------- */
/* 18-19. Course concurrente perdue (23505) — absorbée, jamais une erreur     */
/* -------------------------------------------------------------------------- */

test("course concurrente perdue (full_reversal) — 23505 sur l'INSERT absorbé silencieusement", async () => {
  const { tx } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: {
      id: "orig-id-8",
      cancellationTreatment: "full_reversal",
    },
    creditLedgerEntries: [{ amount: "20.00" }],
    insertThrowsUniqueViolation: true,
  })

  // Ne doit PAS rejeter — la course perdue est un no-op, pas une erreur.
  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-17",
    publicRef: "REF-017",
    actorUserId: null,
  })
})

test("course concurrente perdue (non_refundable) — 23505 sur l'INSERT absorbé silencieusement", async () => {
  const { tx } = makeMockTx({
    financialsRow: { commissionAmount: "20.00" },
    originalEntitlement: {
      id: "orig-id-9",
      cancellationTreatment: "non_refundable",
    },
    insertThrowsUniqueViolation: true,
  })

  await reverseCommissionOnCancellation(tx, {
    reservationId: "res-18",
    publicRef: "REF-018",
    actorUserId: null,
  })
})

test("erreur non-23505 sur l'INSERT compensatoire → remontée, jamais absorbée", async () => {
  const insertValues: Record<string, unknown>[] = []
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (_n: number) => {
            const seq = [
              [{ commissionAmount: "20.00" }],
              [{ id: "orig-id-10", cancellationTreatment: "full_reversal" }],
              [],
              [{ amount: "20.00" }],
            ]
            return Promise.resolve(seq[selectIdx++] ?? [])
          },
        }),
      }),
    }),
    execute: async () => {},
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        insertValues.push(row)
        return Promise.reject(new Error("connection reset"))
      },
    }),
  } as unknown as DrizzleTransaction
  let selectIdx = 0

  await assert.rejects(
    () =>
      reverseCommissionOnCancellation(tx, {
        reservationId: "res-19",
        publicRef: "REF-019",
        actorUserId: null,
      }),
    (err: Error) => {
      assert.strictEqual(err.message, "connection reset")
      return true
    },
  )
})
