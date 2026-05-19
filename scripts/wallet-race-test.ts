#!/usr/bin/env tsx
/**
 * wallet-race-test.ts
 *
 * Simule un double débit simultané sur `agencies.depositBalance`
 * pour vérifier que Drizzle ORM + Postgres gère correctement
 * les transactions concurrentes (pas de race condition).
 *
 * Prérequis :
 *   DATABASE_URL pointe vers la DB de test (NE PAS utiliser la prod)
 *
 * Usage :
 *   npx tsx scripts/wallet-race-test.ts
 */

import { eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { agencies } from "@/lib/db/schema"

const AGENCY_ID = process.env.TEST_AGENCY_ID ?? "00000000-0000-0000-0000-000000000001"
const DEBIT_AMOUNT = "50.00"
const INITIAL_BALANCE = "200.00"

async function resetBalance() {
  const db = getDb()
  await db
    .update(agencies)
    .set({ depositBalance: sql`cast(${INITIAL_BALANCE} as decimal)` })
    .where(eq(agencies.id, AGENCY_ID))
  console.log(`💰 Solde initialisé à ${INITIAL_BALANCE} TND`)
}

async function getBalance() {
  const db = getDb()
  const row = await db
    .select({ balance: agencies.depositBalance })
    .from(agencies)
    .where(eq(agencies.id, AGENCY_ID))
    .limit(1)
  return row[0]?.balance ?? "0"
}

/**
 * Débite le solde en utilisant une transaction SQL atomique.
 * Retourne true si le débit a réussi, false si solde insuffisant.
 */
async function debitSafely(): Promise<boolean> {
  const db = getDb()

  return db.transaction(async (tx) => {
    // Verrouillage pessimiste (FOR UPDATE) sur la ligne agency
    const [row] = await tx
      .select({ balance: agencies.depositBalance })
      .from(agencies)
      .where(eq(agencies.id, AGENCY_ID))
      .for("update")
      .limit(1)

    if (!row) return false

    const current = parseFloat(String(row.balance))
    const debit = parseFloat(DEBIT_AMOUNT)

    if (current < debit) {
      return false // solde insuffisant
    }

    await tx
      .update(agencies)
      .set({
        depositBalance: sql`${agencies.depositBalance} - cast(${DEBIT_AMOUNT} as decimal)`,
      })
      .where(eq(agencies.id, AGENCY_ID))

    return true
  })
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL manquant")
    process.exit(1)
  }

  await resetBalance()

  const before = await getBalance()
  console.log(`🔎 Solde avant race : ${before} TND`)

  // Lance 5 débits simultanés (200 TND -> 5×50 = 250, seuls 4 doivent passer)
  const promises = Array.from({ length: 5 }, (_, i) =>
    debitSafely().then((ok) => ({ index: i + 1, ok })),
  )

  const results = await Promise.all(promises)
  const successes = results.filter((r) => r.ok).length
  const failures = results.filter((r) => !r.ok).length

  const after = await getBalance()
  const expected = Math.max(0, parseFloat(INITIAL_BALANCE) - successes * parseFloat(DEBIT_AMOUNT))

  console.log(`\n📊 Résultats :`)
  console.table(results)
  console.log(`\n✅ Succès : ${successes}`)
  console.log(`❌ Échecs (solde insuffisant) : ${failures}`)
  console.log(`💰 Solde final DB  : ${after} TND`)
  console.log(`🧮 Solde attendu   : ${expected.toFixed(2)} TND`)

  const ok = parseFloat(String(after)) === expected
  console.log(ok ? "\n🎉 PAS DE RACE CONDITION — les transactions sont atomiques." : "\n💥 RACE CONDITION DÉTECTÉE !")
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error("Erreur fatale :", err)
  process.exit(1)
})
