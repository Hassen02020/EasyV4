/**
 * WALLET-TOPUP-STATE-01 — Tests d'intégration réels (Postgres non-bypass-RLS)
 * pour les fonctions de lecture wallet B2C : `getCustomerWalletBalance` et
 * `getCustomerWalletTransactions` (`lib/finance/customer-wallet.ts`).
 *
 * Trou identifié lors de l'audit WALLET-TOPUP-STATE-01 (2026-10-24) :
 * `processCustomerTopupWebhookCore` est couvert par 8 scénarios dans
 * `customer-topup-webhook-core.integration.test.ts`, mais la couche lecture
 * (solde, historique) n'avait aucun test d'intégration DB.
 *
 * Scénarios couverts (T1–T7) :
 *  T1 — Solde initial à 0 avant tout crédit (customer sans wallet_account)
 *  T2 — Solde correct après un crédit unique
 *  T3 — Solde cumulé après plusieurs crédits successifs
 *  T4 — Historique des transactions : 1 entrée, champs vérifiés
 *  T5 — Ordre chronologique inverse (plus récent en premier)
 *  T6 — Isolation tenant : crédit agence A invisible depuis agence B
 *  T7 — Pas de crédit avant validation effective (pending → solde 0)
 *
 * Convention : isDbAvailable() dégrade en skip si Postgres local indisponible.
 * Fixtures isolées par agence (UUID aléatoire), nettoyage dans finally.
 * wallet_ledger (append-only) nettoyé via cleanupAsSuperuser (DATABASE_DIRECT_URL).
 */

import test, { before } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql, count } from "drizzle-orm"

import { withSystemContext } from "@/lib/db/tenant-context"
import { cleanupAsSuperuser } from "@/lib/db/test-helpers/superuser-cleanup"
import {
  agencies,
  customers,
  customerTopupRequests,
  walletAccounts,
  walletLedger,
} from "@/lib/db/schema"
import {
  creditCustomerWallet,
  getCustomerWalletBalance,
  getCustomerWalletTransactions,
} from "@/lib/finance/customer-wallet"

/* -------------------------------------------------------------------------- */
/* DB availability guard                                                       */
/* -------------------------------------------------------------------------- */

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skip = () =>
  "Postgres local indisponible (DATABASE_URL) — voir customer-topup-webhook-core.integration.test.ts pour la procédure."

before(async () => {
  dbAvailable = await isDbAvailable()
})

/* -------------------------------------------------------------------------- */
/* Fixtures — une agence/un client par scénario, jamais partagées.            */
/* -------------------------------------------------------------------------- */

interface Fixture {
  agencyId: string
  customerId: string
}

const PREFIX = "wts01"

async function createFixture(): Promise<Fixture> {
  const agencyId = randomUUID()
  const customerId = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `${PREFIX}-${agencyId.slice(0, 8)}`,
      name: "WALLET-TOPUP-STATE-01 — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "State",
      email: `${PREFIX}-${customerId.slice(0, 8)}@test.invalid`,
    })
  })

  return { agencyId, customerId }
}

async function cleanupFixture(f: Fixture): Promise<void> {
  // wallet_ledger est append-only — app_runtime n'a pas DELETE —
  // nettoyage via superuser, avant wallet_accounts.
  await cleanupAsSuperuser(
    (s) =>
      s`delete from wallet_ledger where wallet_account_id in (select id from wallet_accounts where customer_id = ${f.customerId}::uuid)`,
  )
  await withSystemContext(async (tx) => {
    await tx
      .delete(customerTopupRequests)
      .where(eq(customerTopupRequests.customerId, f.customerId))
    await tx
      .delete(walletAccounts)
      .where(eq(walletAccounts.customerId, f.customerId))
    await tx.delete(customers).where(eq(customers.id, f.customerId))
    await tx.delete(agencies).where(eq(agencies.id, f.agencyId))
  })
}

/* -------------------------------------------------------------------------- */
/* T1 — Solde initial à 0 avant tout crédit                                   */
/* -------------------------------------------------------------------------- */

test("T1 — solde initial à 0 et historique vide avant tout crédit", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture()
  try {
    const balance = await getCustomerWalletBalance(f.customerId)
    assert.equal(balance, 0, "solde doit être 0 sans wallet_account")

    const txs = await getCustomerWalletTransactions(f.customerId)
    assert.deepEqual(txs, [], "historique doit être vide sans crédit")

    // Vérification directe : aucun wallet_account créé
    const wallets = await withSystemContext((tx) =>
      tx
        .select({ cnt: count() })
        .from(walletAccounts)
        .where(eq(walletAccounts.customerId, f.customerId)),
    )
    assert.equal(
      Number(wallets[0]?.cnt ?? 0),
      0,
      "aucun wallet_account ne doit exister",
    )
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* T2 — Solde correct après un crédit unique                                  */
/* -------------------------------------------------------------------------- */

test("T2 — solde correct après un crédit unique de 100 TND", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture()
  try {
    const result = await creditCustomerWallet({
      customerId: f.customerId,
      amountTnd: 100,
      source: "online_card",
      idempotencyKey: randomUUID(),
      description: "T2 — crédit test intégration",
    })
    assert.ok(
      result.ok,
      `creditCustomerWallet a échoué : ${JSON.stringify(result)}`,
    )

    const balance = await getCustomerWalletBalance(f.customerId)
    assert.equal(balance, 100, "solde doit être 100 après crédit de 100 TND")
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* T3 — Solde cumulé après plusieurs crédits successifs                       */
/* -------------------------------------------------------------------------- */

test("T3 — solde cumulé correct après crédits successifs (50 + 30 = 80 TND)", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture()
  try {
    const r1 = await creditCustomerWallet({
      customerId: f.customerId,
      amountTnd: 50,
      source: "online_card",
      idempotencyKey: randomUUID(),
      description: "T3 — crédit 1/2",
    })
    assert.ok(r1.ok, `crédit 1 a échoué : ${JSON.stringify(r1)}`)

    const r2 = await creditCustomerWallet({
      customerId: f.customerId,
      amountTnd: 30,
      source: "online_card",
      idempotencyKey: randomUUID(),
      description: "T3 — crédit 2/2",
    })
    assert.ok(r2.ok, `crédit 2 a échoué : ${JSON.stringify(r2)}`)

    const balance = await getCustomerWalletBalance(f.customerId)
    assert.equal(balance, 80, "solde cumulé doit être 80 TND (50 + 30)")
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* T4 — Historique : 1 entrée avec champs corrects                            */
/* -------------------------------------------------------------------------- */

test("T4 — historique : 1 entrée, type=credit, category=recharge, montant correct", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture()
  try {
    const r = await creditCustomerWallet({
      customerId: f.customerId,
      amountTnd: 200,
      source: "online_card",
      idempotencyKey: randomUUID(),
      description: "T4 — crédit test historique",
    })
    assert.ok(r.ok, `creditCustomerWallet a échoué : ${JSON.stringify(r)}`)

    const txs = await getCustomerWalletTransactions(f.customerId)
    assert.equal(txs.length, 1, "historique doit contenir exactement 1 entrée")

    const entry = txs[0]!
    assert.equal(entry.type, "credit", "type doit être credit")
    assert.equal(
      entry.category,
      "recharge",
      "category doit être recharge pour online_card",
    )
    assert.equal(entry.amount, 200, "montant doit être 200 TND")
    assert.equal(
      entry.balanceBefore,
      0,
      "balanceBefore doit être 0 (premier crédit)",
    )
    assert.equal(entry.balanceAfter, 200, "balanceAfter doit être 200")
    assert.ok(entry.id, "id doit être présent")
    assert.ok(entry.createdAt instanceof Date, "createdAt doit être une Date")
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* T5 — Ordre chronologique inverse (plus récent en premier)                  */
/* -------------------------------------------------------------------------- */

test("T5 — transactions ordonnées du plus récent au plus ancien", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture()
  try {
    // Trois crédits séquentiels : 10, 20, 30 TND
    for (const amount of [10, 20, 30]) {
      const r = await creditCustomerWallet({
        customerId: f.customerId,
        amountTnd: amount,
        source: "online_card",
        idempotencyKey: randomUUID(),
        description: `T5 — crédit ${amount} TND`,
      })
      assert.ok(r.ok, `crédit ${amount} TND a échoué : ${JSON.stringify(r)}`)
    }

    const txs = await getCustomerWalletTransactions(f.customerId)
    assert.equal(txs.length, 3, "3 entrées attendues")

    // Vérification que les montants sont présents
    const amounts = txs.map((tx) => tx.amount)
    assert.ok(amounts.includes(10), "montant 10 doit être présent")
    assert.ok(amounts.includes(20), "montant 20 doit être présent")
    assert.ok(amounts.includes(30), "montant 30 doit être présent")

    // Le plus récent (30 TND) doit être en premier
    assert.equal(
      txs[0]!.amount,
      30,
      "la transaction la plus récente (30 TND) doit être en première position",
    )

    // Vérification de l'ordre : chaque createdAt >= suivant
    for (let i = 0; i < txs.length - 1; i++) {
      assert.ok(
        txs[i]!.createdAt >= txs[i + 1]!.createdAt,
        `ordre DESC non respecté : index ${i} (${txs[i]!.createdAt.toISOString()}) < index ${i + 1} (${txs[i + 1]!.createdAt.toISOString()})`,
      )
    }
  } finally {
    await cleanupFixture(f)
  }
})

/* -------------------------------------------------------------------------- */
/* T6 — Isolation tenant                                                       */
/* -------------------------------------------------------------------------- */

test("T6 — isolation : crédit agence A invisible depuis agence B", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const fA = await createFixture()
  const fB = await createFixture()
  try {
    // Créditer uniquement customerA
    const r = await creditCustomerWallet({
      customerId: fA.customerId,
      amountTnd: 75,
      source: "online_card",
      idempotencyKey: randomUUID(),
      description: "T6 — crédit agence A",
    })
    assert.ok(r.ok, `crédit agence A a échoué : ${JSON.stringify(r)}`)

    // CustomerA voit son solde
    const balanceA = await getCustomerWalletBalance(fA.customerId)
    assert.equal(balanceA, 75, "solde customerA doit être 75")

    // CustomerB ne voit rien
    const balanceB = await getCustomerWalletBalance(fB.customerId)
    assert.equal(balanceB, 0, "solde customerB doit rester 0 (isolation)")

    const txsB = await getCustomerWalletTransactions(fB.customerId)
    assert.deepEqual(
      txsB,
      [],
      "historique customerB doit être vide (isolation)",
    )
  } finally {
    await Promise.all([cleanupFixture(fA), cleanupFixture(fB)])
  }
})

/* -------------------------------------------------------------------------- */
/* T7 — Pas de crédit avant validation effective du paiement                  */
/* -------------------------------------------------------------------------- */

test("T7 — demande pending n'entraîne aucun crédit wallet", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const f = await createFixture()
  try {
    const topupId = randomUUID()

    // Insérer une demande de recharge en état pending (sans appeler le webhook)
    await withSystemContext(async (tx) => {
      await tx.insert(customerTopupRequests).values({
        id: topupId,
        customerId: f.customerId,
        agencyId: f.agencyId,
        amount: "150.000",
        status: "pending",
        paymentReference: `${PREFIX}-${topupId.slice(0, 8)}`,
        psp: "paymee",
      })
    })

    // Aucun crédit ne doit avoir été appliqué
    const balance = await getCustomerWalletBalance(f.customerId)
    assert.equal(
      balance,
      0,
      "solde doit rester 0 — demande pending non validée",
    )

    const txs = await getCustomerWalletTransactions(f.customerId)
    assert.deepEqual(
      txs,
      [],
      "historique doit être vide — pas de crédit avant webhook",
    )

    // Vérification directe : aucun wallet_account créé
    const ledgerRows = await withSystemContext((tx) =>
      tx
        .select({ cnt: count() })
        .from(walletLedger)
        .innerJoin(
          walletAccounts,
          eq(walletLedger.walletAccountId, walletAccounts.id),
        )
        .where(eq(walletAccounts.customerId, f.customerId)),
    )
    assert.equal(
      Number(ledgerRows[0]?.cnt ?? 0),
      0,
      "aucune entrée wallet_ledger ne doit exister avant validation",
    )
  } finally {
    await cleanupFixture(f)
  }
})
