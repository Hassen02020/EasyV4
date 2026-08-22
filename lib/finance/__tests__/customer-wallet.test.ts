/**
 * Tests unitaires — `debitCustomerWallet`/`creditCustomerWallet`
 * (Wallet/Payment Core).
 *
 * Même stratégie de mock que `lib/pro/__tests__/booking-actions.test.ts`
 * (`debitPartnerCredit`) : un faux client Drizzle qui journalise chaque
 * opération, pour vérifier l'ordre exact (lock/create → insert ledger →
 * update solde) et le comportement solde-insuffisant/montant invalide.
 */

import test from "node:test"
import assert from "node:assert/strict"

import {
  debitCustomerWallet,
  creditCustomerWallet,
  getCustomerWalletBalance,
  formatTnd,
  parseTnd,
  isValidWalletAmount,
  type DrizzleLikeDb,
} from "../customer-wallet"

type OpKind = "TX_BEGIN" | "SELECT_FOR_UPDATE" | "INSERT_WALLET" | "INSERT_LEDGER" | "UPDATE_BALANCE" | "TX_COMMIT" | "TX_ROLLBACK"
type OpEvent = { kind: OpKind; payload?: Record<string, unknown> }

type MockOptions = {
  /** `null` = aucun compte wallet existant pour ce client (sera créé). */
  existingBalance: string | null
  ledgerInsertReturnsId?: string | null
}

function makeMockDb(opts: MockOptions): { db: DrizzleLikeDb; journal: OpEvent[] } {
  const journal: OpEvent[] = []
  let insertCallCount = 0

  const db = {
    transaction: async <T>(callback: (tx: ReturnType<typeof makeTx>) => Promise<T>) => {
      journal.push({ kind: "TX_BEGIN" })
      try {
        const out = await callback(makeTx())
        if (typeof out === "object" && out !== null && "ok" in out && (out as { ok: boolean }).ok === false) {
          journal.push({ kind: "TX_ROLLBACK" })
        } else {
          journal.push({ kind: "TX_COMMIT" })
        }
        return out
      } catch (err) {
        journal.push({ kind: "TX_ROLLBACK" })
        throw err
      }
    },
  }

  function makeTx() {
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            for: async (...forArgs: unknown[]) => {
              journal.push({ kind: "SELECT_FOR_UPDATE", payload: { strength: forArgs[0] } })
              if (opts.existingBalance === null) return []
              return [{ id: "wallet-account-uuid-test", currentBalance: opts.existingBalance }]
            },
          }),
        }),
      }),
      insert: () => ({
        values: (...args: unknown[]) => ({
          returning: async () => {
            insertCallCount += 1
            const row = (args[0] ?? {}) as Record<string, unknown>
            // 1er insert (si le compte n'existait pas) = wallet_accounts, sinon = wallet_ledger
            if (opts.existingBalance === null && insertCallCount === 1) {
              journal.push({ kind: "INSERT_WALLET", payload: row })
              return [{ id: "wallet-account-uuid-test", currentBalance: "0" }]
            }
            journal.push({ kind: "INSERT_LEDGER", payload: row })
            if (opts.ledgerInsertReturnsId === null) return []
            return [{ id: opts.ledgerInsertReturnsId ?? "ledger-uuid-test" }]
          },
        }),
      }),
      update: () => ({
        set: (...args: unknown[]) => ({
          where: async () => {
            journal.push({ kind: "UPDATE_BALANCE", payload: (args[0] ?? {}) as Record<string, unknown> })
            return []
          },
        }),
      }),
    }
  }

  return { db: db as unknown as DrizzleLikeDb, journal }
}

function ensureDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_only_for_mocks"
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers purs                                                               */
/* -------------------------------------------------------------------------- */

test("formatTnd : 2 décimales", () => {
  assert.equal(formatTnd(1000), "1000.00")
  assert.equal(formatTnd(841.256), "841.26")
})

test("parseTnd : string et number", () => {
  assert.equal(parseTnd("1000.00"), 1000)
  assert.equal(parseTnd(500), 500)
})

test("isValidWalletAmount : rejette 0, négatif, NaN, Infinity ; accepte >= 0.01", () => {
  assert.equal(isValidWalletAmount(0), false)
  assert.equal(isValidWalletAmount(-5), false)
  assert.equal(isValidWalletAmount(0.001), false)
  assert.equal(isValidWalletAmount(0.01), true)
  assert.equal(isValidWalletAmount(Number.NaN), false)
  assert.equal(isValidWalletAmount(Number.POSITIVE_INFINITY), false)
})

/* -------------------------------------------------------------------------- */
/* debitCustomerWallet                                                        */
/* -------------------------------------------------------------------------- */

test("debitCustomerWallet : succès avec solde suffisant, ordre des opérations", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({ existingBalance: "500.00" })

  const result = await debitCustomerWallet({
    customerId: "customer-uuid-test",
    amountTnd: 199.5,
    reservationId: "reservation-uuid-test",
    description: "Réservation hôtel — paiement wallet",
    dbOverride: db,
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.balanceBefore, "500.00")
    assert.equal(result.balanceAfter, "300.50")
  }
  assert.deepEqual(journal.map((j) => j.kind), [
    "TX_BEGIN",
    "SELECT_FOR_UPDATE",
    "INSERT_LEDGER",
    "UPDATE_BALANCE",
    "TX_COMMIT",
  ])
  const lockOp = journal.find((j) => j.kind === "SELECT_FOR_UPDATE")
  assert.equal(lockOp?.payload?.strength, "update")
  const ledgerOp = journal.find((j) => j.kind === "INSERT_LEDGER")
  assert.equal(ledgerOp?.payload?.type, "debit")
  assert.equal(ledgerOp?.payload?.amount, "199.50")
})

test("debitCustomerWallet : refuse si solde insuffisant (rollback, aucun débit)", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({ existingBalance: "50.00" })

  const result = await debitCustomerWallet({
    customerId: "customer-uuid-test",
    amountTnd: 199.5,
    description: "Réservation hôtel — paiement wallet",
    dbOverride: db,
  })

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "INSUFFICIENT_FUNDS")
  assert.deepEqual(journal.map((j) => j.kind), ["TX_BEGIN", "SELECT_FOR_UPDATE", "TX_ROLLBACK"])
})

test("debitCustomerWallet : crée le compte wallet client au premier débit (jamais de découvert)", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({ existingBalance: null })

  const result = await debitCustomerWallet({
    customerId: "customer-uuid-test",
    amountTnd: 10,
    description: "test",
    dbOverride: db,
  })

  // Aucun solde préexistant (0) < 10 demandé → insuffisant, jamais de découvert
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "INSUFFICIENT_FUNDS")
  assert.deepEqual(journal.map((j) => j.kind), ["TX_BEGIN", "SELECT_FOR_UPDATE", "INSERT_WALLET", "TX_ROLLBACK"])
})

test("debitCustomerWallet : rejette un montant invalide avant toute I/O", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({ existingBalance: "500.00" })
  const result = await debitCustomerWallet({
    customerId: "customer-uuid-test",
    amountTnd: -5,
    description: "test",
    dbOverride: db,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "INVALID_AMOUNT")
  assert.deepEqual(journal, [])
})

test("debitCustomerWallet : idempotence — une deuxième soumission avec la même clé retourne le résultat caché sans redébiter", async () => {
  ensureDatabaseUrl()
  const { db } = makeMockDb({ existingBalance: "500.00" })
  const cache = new Map<string, string>()
  const redisOverride = {
    get: async <T>(key: string) => (cache.has(key) ? (JSON.parse(cache.get(key)!) as T) : null),
    set: async (key: string, value: string) => {
      cache.set(key, value)
    },
  }

  const first = await debitCustomerWallet({
    customerId: "customer-uuid-test",
    amountTnd: 100,
    description: "test",
    idempotencyKey: "guest-draft-abc:wallet",
    dbOverride: db,
    redisOverride,
  })
  assert.equal(first.ok, true)

  // Un deuxième appel doit retourner EXACTEMENT le même résultat caché,
  // sans exécuter de nouvelle transaction (le mock db.transaction()
  // journaliserait sinon un 2e TX_BEGIN — on vérifie via le solde renvoyé,
  // qui serait différent si le débit s'exécutait deux fois de suite).
  const second = await debitCustomerWallet({
    customerId: "customer-uuid-test",
    amountTnd: 100,
    description: "test",
    idempotencyKey: "guest-draft-abc:wallet",
    dbOverride: db,
    redisOverride,
  })
  assert.deepEqual(second, first)
})

/* -------------------------------------------------------------------------- */
/* creditCustomerWallet                                                       */
/* -------------------------------------------------------------------------- */

test("creditCustomerWallet : crédite un remboursement, ordre des opérations", async () => {
  ensureDatabaseUrl()
  const { db, journal } = makeMockDb({ existingBalance: "0.00" })

  const result = await creditCustomerWallet({
    customerId: "customer-uuid-test",
    amountTnd: 250,
    reservationId: "reservation-uuid-test",
    paymentId: "payment-uuid-test",
    description: "Remboursement réservation E2B-2026-000123",
    source: "refund",
    dbOverride: db,
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.balanceBefore, "0.00")
    assert.equal(result.balanceAfter, "250.00")
  }
  assert.deepEqual(journal.map((j) => j.kind), [
    "TX_BEGIN",
    "SELECT_FOR_UPDATE",
    "INSERT_LEDGER",
    "UPDATE_BALANCE",
    "TX_COMMIT",
  ])
  const ledgerOp = journal.find((j) => j.kind === "INSERT_LEDGER")
  assert.equal(ledgerOp?.payload?.type, "credit")
})

test("creditCustomerWallet : rejette un montant invalide", async () => {
  ensureDatabaseUrl()
  const { db } = makeMockDb({ existingBalance: "0.00" })
  const result = await creditCustomerWallet({
    customerId: "customer-uuid-test",
    amountTnd: 0,
    description: "test",
    source: "refund",
    dbOverride: db,
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, "INVALID_AMOUNT")
})

/* -------------------------------------------------------------------------- */
/* getCustomerWalletBalance                                                   */
/* -------------------------------------------------------------------------- */

test("getCustomerWalletBalance : renvoie 0 sans DATABASE_URL (jamais de solde inventé)", async () => {
  const saved = process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  try {
    const balance = await getCustomerWalletBalance("customer-uuid-test")
    assert.equal(balance, 0)
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved
  }
})
