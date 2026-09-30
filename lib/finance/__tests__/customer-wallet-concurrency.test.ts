/**
 * WALLET-RACE-CI-01 — preuve de concurrence RÉELLE sur `debitCustomerWallet`
 * (lib/finance/customer-wallet.ts), le débit du solde client final B2C
 * (`wallet_accounts.current_balance` / `wallet_ledger`).
 *
 * ⚠️ NOT VERIFIED — requires live Postgres to run. Ce fichier n'a jamais été
 * exécuté avec succès contre une vraie base dans la session qui l'a écrit :
 * Docker indisponible dans ce sandbox (`docker ps` → daemon injoignable) et
 * `DATABASE_URL` non définie dans ce worktree. Le skip guard ci-dessous
 * (`isDbAvailable()`) fait que ces tests se `skip`-ent proprement en local
 * sans DB, exactement comme `lib/journeys/__tests__/journeys-core.test.ts` —
 * mais AUCUNE exécution réelle n'a eu lieu ici. À faire tourner en CI ou en
 * local avec un Postgres réel avant de considérer ce chantier clos.
 *
 * Même paire de preuves que `lib/pro/__tests__/booking-actions-concurrency.test.ts`
 * (voir ce fichier pour le détail du raisonnement double-spend / lost
 * update), appliquée ici au second — et dernier — chemin de débit wallet
 * réel du dépôt : le solde CLIENT (`debitCustomerWallet`), distinct du
 * solde AGENCE (`debitPartnerCredit`, déjà couvert). Le verrou testé est le
 * `SELECT ... FOR UPDATE` direct sur `wallet_accounts`
 * (`lockOrCreateCustomerWallet`, sous contexte RLS élevé LOCAL — voir tête
 * de fichier de customer-wallet.ts). Chaque appel ouvre SA PROPRE
 * transaction (aucun `txOverride` partagé), comme deux requêtes HTTP
 * concurrentes réelles.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, and, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  walletAccounts,
  walletLedger,
} from "@/lib/db/schema"
import { debitCustomerWallet, parseTnd } from "../customer-wallet"

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
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

/**
 * Crée un client (rattaché à une agence jetable, requis par le schéma
 * `customers`) et pré-crédite son wallet au solde demandé, en insérant
 * directement la ligne `wallet_accounts` (contourne `creditCustomerWallet`
 * pour ne pas dépendre, dans ce setup, du chemin testé lui-même).
 */
async function createFundedCustomer(
  balanceTnd: number,
): Promise<{ customerId: string; agencyId: string }> {
  const suffix = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({
        name: `Wallet Race Test Agency ${suffix}`,
        agencyType: "ota",
        slug: `wallet-race-cw-test-${suffix}`,
      })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({
        agencyId: agency!.id,
        civility: "M",
        firstName: "Wallet",
        lastName: `Race ${suffix}`,
        phone: "20000000",
      })
      .returning({ id: customers.id })
    await tx.insert(walletAccounts).values({
      customerId: customer!.id,
      type: "credit",
      currentBalance: balanceTnd.toFixed(2),
      name: "Solde client",
    })
    return { customerId: customer!.id, agencyId: agency!.id }
  })
}

async function cleanupCustomer(
  customerId: string,
  agencyId: string,
): Promise<void> {
  await withSystemContext(async (tx) => {
    const [wallet] = await tx
      .select({ id: walletAccounts.id })
      .from(walletAccounts)
      .where(
        and(
          eq(walletAccounts.customerId, customerId),
          eq(walletAccounts.type, "credit"),
        ),
      )
    if (wallet) {
      await tx
        .delete(walletLedger)
        .where(eq(walletLedger.walletAccountId, wallet.id))
      await tx.delete(walletAccounts).where(eq(walletAccounts.id, wallet.id))
    }
    await tx.delete(customers).where(eq(customers.id, customerId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
}

async function readBalance(customerId: string): Promise<number> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ currentBalance: walletAccounts.currentBalance })
      .from(walletAccounts)
      .where(
        and(
          eq(walletAccounts.customerId, customerId),
          eq(walletAccounts.type, "credit"),
        ),
      )
    return parseTnd(row!.currentBalance)
  })
}

let doubleSpend: { customerId: string; agencyId: string } | null = null
let lostUpdate: { customerId: string; agencyId: string } | null = null

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  doubleSpend = await createFundedCustomer(100)
  lostUpdate = await createFundedCustomer(100)
})

after(async () => {
  if (!dbAvailable) return
  if (doubleSpend)
    await cleanupCustomer(doubleSpend.customerId, doubleSpend.agencyId)
  if (lostUpdate)
    await cleanupCustomer(lostUpdate.customerId, lostUpdate.agencyId)
})

test("debitCustomerWallet : deux débits concurrents dont la somme dépasse le solde -> exactement un réussit, jamais un découvert client", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  // Solde = 100.00 TND. Deux débits de 60 TND concurrents : la somme (120)
  // dépasse le solde, un seul doit passer — le wallet client ne doit
  // JAMAIS passer en négatif (contrairement au wallet agence qui a une
  // tolérance configurable, voir en tête de fichier de customer-wallet.ts).
  const [resultA, resultB] = await Promise.all([
    debitCustomerWallet({
      customerId: doubleSpend!.customerId,
      amountTnd: 60,
      description: "WALLET-RACE-CI-01 — bras A",
    }),
    debitCustomerWallet({
      customerId: doubleSpend!.customerId,
      amountTnd: 60,
      description: "WALLET-RACE-CI-01 — bras B",
    }),
  ])

  const results = [resultA, resultB]
  const winners = results.filter((r) => r.ok)
  const losers = results.filter((r) => !r.ok)

  assert.equal(winners.length, 1, "exactement un débit concurrent doit réussir")
  assert.equal(losers.length, 1, "exactement un débit concurrent doit échouer")
  assert.ok(
    losers[0]!.ok === false && losers[0]!.code === "INSUFFICIENT_FUNDS",
    "le perdant doit échouer précisément pour solde insuffisant",
  )

  const finalBalance = await readBalance(doubleSpend!.customerId)
  assert.equal(
    finalBalance,
    40,
    "le solde final doit refléter UN SEUL débit de 60 (100 - 60 = 40), jamais négatif (double-spend)",
  )

  const ledgerRows = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .innerJoin(
        walletAccounts,
        eq(walletAccounts.id, walletLedger.walletAccountId),
      )
      .where(eq(walletAccounts.customerId, doubleSpend!.customerId)),
  )
  assert.equal(
    ledgerRows.length,
    1,
    "un seul mouvement de débit doit avoir été inséré",
  )
})

test("debitCustomerWallet : deux débits concurrents dont la somme NE dépasse PAS le solde -> les deux réussissent, aucun 'lost update'", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  // Solde = 100.00 TND. Deux débits de 40 TND concurrents : la somme (80)
  // NE dépasse PAS le solde -> les deux doivent réussir ET le solde final
  // doit être 20 (100 - 40 - 40), jamais 60 (lost update).
  const [resultA, resultB] = await Promise.all([
    debitCustomerWallet({
      customerId: lostUpdate!.customerId,
      amountTnd: 40,
      description: "WALLET-RACE-CI-01 — bras A",
    }),
    debitCustomerWallet({
      customerId: lostUpdate!.customerId,
      amountTnd: 40,
      description: "WALLET-RACE-CI-01 — bras B",
    }),
  ])

  const results = [resultA, resultB]
  assert.ok(
    results.every((r) => r.ok),
    "les deux débits doivent réussir (solde suffisant pour les deux)",
  )

  const finalBalance = await readBalance(lostUpdate!.customerId)
  assert.equal(
    finalBalance,
    20,
    "le solde final doit refléter LES DEUX débits (100 - 40 - 40 = 20) — un solde de 60 signalerait un lost update",
  )

  const ledgerRows = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .innerJoin(
        walletAccounts,
        eq(walletAccounts.id, walletLedger.walletAccountId),
      )
      .where(eq(walletAccounts.customerId, lostUpdate!.customerId)),
  )
  assert.equal(
    ledgerRows.length,
    2,
    "deux mouvements de débit distincts doivent avoir été insérés",
  )
})
