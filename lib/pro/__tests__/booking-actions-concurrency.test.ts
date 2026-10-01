/**
 * WALLET-RACE-CI-01 — preuve de concurrence RÉELLE sur `debitPartnerCredit`
 * (lib/pro/booking-actions.ts), le débit du wallet agence B2B
 * (`agencies.deposit_balance` / `partner_credit_movements`).
 *
 * Le skip guard ci-dessous (`isDbAvailable()`) fait que ces tests se
 * `skip`-ent proprement en local sans DB, exactement comme
 * `lib/journeys/__tests__/journeys-core.test.ts`.
 *
 * BOOKING-CONCURRENCY-TEST-RLS-FIX-01 (2026-09-30) — première exécution
 * réelle en CI (FINANCIAL-E2E-01, PR #85) : les deux tests échouaient avec
 * "new row violates row-level security policy for table
 * partner_credit_movements". Cause : ce fichier appelait debitPartnerCredit
 * SANS contexte tenant (aucun withTenantContext), retombant sur le mode
 * getDb() autonome de la fonction (lib/pro/booking-actions.ts:500-503) —
 * jamais utilisé par un appelant de production réel (tous passent
 * txOverride depuis un withTenantContext déjà établi : lib/booking/
 * actions.ts:627, lib/cars/actions.ts:262, lib/transfers/actions.ts:225).
 * Corrigé en donnant à CHAQUE bras concurrent son propre
 * withTenantContext/txOverride (voir commentaire dans le premier test) —
 * pas un défaut applicatif.
 *
 * Ce que ce fichier prouve, une fois exécuté contre un Postgres réel :
 *
 *  1. "Double-spend" — deux débits concurrents dont la SOMME dépasse le
 *     solde disponible : exactement un doit réussir (ok:true), l'autre doit
 *     échouer INSUFFICIENT_FUNDS. Jamais les deux qui passent (ce qui
 *     découvrirait le compte au-delà de sa tolérance — le bug qu'un simple
 *     "SELECT solde, vérifier, puis UPDATE" sans verrouillage permettrait :
 *     les deux transactions liraient le même solde initial avant que l'une
 *     n'ait committé son écriture).
 *
 *  2. "Lost update" — deux débits concurrents dont la somme NE dépasse PAS
 *     le solde disponible : les DEUX doivent réussir ET le solde final doit
 *     refléter les DEUX débits (jamais un solde qui n'en reflète qu'un seul
 *     parce que la seconde transaction aurait lu un solde périmé avant le
 *     commit de la première).
 *
 * Le verrou testé est `lock_agency_for_debit()` (SELECT ... FOR UPDATE,
 * SECURITY DEFINER — drizzle/manual/0025_agency_debit_lock_rls_gap.sql),
 * appelé par `debitPartnerCredit`. Chaque appel de ce test ouvre SA PROPRE
 * transaction Drizzle, via SON PROPRE `withTenantContext`/`txOverride` —
 * jamais un contexte/transaction partagé entre les deux bras concurrents,
 * ce qui les sérialiserait — c'est exactement le chemin emprunté par deux
 * requêtes HTTP concurrentes en production (deux réservations B2B
 * simultanées sur la même agence), pas une simulation artificielle dans
 * une seule transaction.
 *
 * Même convention que `journeys-core.test.ts` : `before`/`after` créent et
 * nettoient des agences de test dédiées ; `isDbAvailable()` fait `t.skip()`
 * proprement si aucun Postgres local n'est joignable.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { agencies, partnerCreditMovements } from "@/lib/db/schema"
import { debitPartnerCredit, parseTnd } from "../booking-actions"

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

/** Crée une agence de test avec un solde de dépôt connu, tolérance 0. */
async function createTestAgency(depositBalanceTnd: number): Promise<string> {
  const suffix = randomUUID().slice(0, 8)
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({
        name: `Wallet Race Test Agency ${suffix}`,
        agencyType: "partner",
        slug: `wallet-race-test-${suffix}`,
        depositBalance: depositBalanceTnd.toFixed(3),
        reservationTolerance: "0.000",
      })
      .returning({ id: agencies.id })
    return agency!.id
  })
}

async function cleanupAgency(agencyId: string): Promise<void> {
  await withSystemContext(async (tx) => {
    // `partner_credit_movements.agency_id` référence `agencies.id` en
    // `onDelete: "restrict"` — les mouvements doivent être supprimés avant
    // l'agence elle-même.
    await tx
      .delete(partnerCreditMovements)
      .where(eq(partnerCreditMovements.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
}

async function readBalance(agencyId: string): Promise<number> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ depositBalance: agencies.depositBalance })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
    return parseTnd(row!.depositBalance)
  })
}

let doubleSpendAgencyId = ""
let lostUpdateAgencyId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  doubleSpendAgencyId = await createTestAgency(100)
  lostUpdateAgencyId = await createTestAgency(100)
})

after(async () => {
  if (!dbAvailable) return
  if (doubleSpendAgencyId) await cleanupAgency(doubleSpendAgencyId)
  if (lostUpdateAgencyId) await cleanupAgency(lostUpdateAgencyId)
})

test("debitPartnerCredit : deux débits concurrents dont la somme dépasse le solde -> exactement un réussit, jamais un double-spend", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  // Solde = 100.000 TND, tolérance 0. Deux débits de 60 TND concurrents :
  // la somme (120) dépasse le solde disponible, donc un seul doit passer.
  // Chaque bras pose SON PROPRE contexte tenant (withTenantContext), dans
  // SA PROPRE transaction (txOverride) — exactement comme deux requêtes
  // HTTP concurrentes en production (lib/booking/actions.ts:627 et
  // consorts, qui appellent toujours debitPartnerCredit avec un txOverride
  // issu d'un withTenantContext déjà établi en amont). Un seul
  // withTenantContext partagé entre les deux bras servirait les deux
  // débits dans LA MÊME transaction, ce qui les sérialiserait et invaliderait
  // la preuve de concurrence réelle que ce test doit apporter.
  const [resultA, resultB] = await Promise.all([
    withTenantContext({ agencyId: doubleSpendAgencyId, userId: randomUUID(), isSuperAdmin: false }, (tx) =>
      debitPartnerCredit({
        agencyId: doubleSpendAgencyId,
        amountTnd: 60,
        reference: `WALLET-RACE-DS-A-${randomUUID().slice(0, 8)}`,
        description: "WALLET-RACE-CI-01 — bras A",
        txOverride: tx as Parameters<typeof debitPartnerCredit>[0]["txOverride"],
      }),
    ),
    withTenantContext({ agencyId: doubleSpendAgencyId, userId: randomUUID(), isSuperAdmin: false }, (tx) =>
      debitPartnerCredit({
        agencyId: doubleSpendAgencyId,
        amountTnd: 60,
        reference: `WALLET-RACE-DS-B-${randomUUID().slice(0, 8)}`,
        description: "WALLET-RACE-CI-01 — bras B",
        txOverride: tx as Parameters<typeof debitPartnerCredit>[0]["txOverride"],
      }),
    ),
  ])

  const results = [resultA, resultB]
  const winners = results.filter((r) => r.ok)
  const losers = results.filter((r) => !r.ok)

  assert.equal(winners.length, 1, "exactement un débit concurrent doit réussir")
  assert.equal(losers.length, 1, "exactement un débit concurrent doit échouer")
  assert.ok(
    losers[0]!.ok === false && losers[0]!.code === "INSUFFICIENT_FUNDS",
    "le perdant doit échouer précisément pour solde insuffisant, pas pour une autre raison",
  )

  const finalBalance = await readBalance(doubleSpendAgencyId)
  assert.equal(
    finalBalance,
    40,
    "le solde final doit refléter UN SEUL débit de 60 (100 - 60 = 40), jamais 100 (les deux rejetés) ni -20 (les deux acceptés — double-spend)",
  )

  const movements = await withSystemContext((tx) =>
    tx
      .select({ id: partnerCreditMovements.id })
      .from(partnerCreditMovements)
      .where(eq(partnerCreditMovements.agencyId, doubleSpendAgencyId)),
  )
  assert.equal(
    movements.length,
    1,
    "un seul mouvement de débit doit avoir été inséré",
  )
})

test("debitPartnerCredit : deux débits concurrents dont la somme NE dépasse PAS le solde -> les deux réussissent, aucun 'lost update'", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  // Solde = 100.000 TND. Deux débits de 40 TND concurrents : la somme (80)
  // NE dépasse PAS le solde, donc les deux doivent réussir ET le solde
  // final doit être 20 (100 - 40 - 40), jamais 60 (ce que donnerait un
  // "lost update" où la seconde transaction lirait le solde AVANT le
  // commit de la première et écraserait son résultat).
  const [resultA, resultB] = await Promise.all([
    withTenantContext({ agencyId: lostUpdateAgencyId, userId: randomUUID(), isSuperAdmin: false }, (tx) =>
      debitPartnerCredit({
        agencyId: lostUpdateAgencyId,
        amountTnd: 40,
        reference: `WALLET-RACE-LU-A-${randomUUID().slice(0, 8)}`,
        description: "WALLET-RACE-CI-01 — bras A",
        txOverride: tx as Parameters<typeof debitPartnerCredit>[0]["txOverride"],
      }),
    ),
    withTenantContext({ agencyId: lostUpdateAgencyId, userId: randomUUID(), isSuperAdmin: false }, (tx) =>
      debitPartnerCredit({
        agencyId: lostUpdateAgencyId,
        amountTnd: 40,
        reference: `WALLET-RACE-LU-B-${randomUUID().slice(0, 8)}`,
        description: "WALLET-RACE-CI-01 — bras B",
        txOverride: tx as Parameters<typeof debitPartnerCredit>[0]["txOverride"],
      }),
    ),
  ])

  const results = [resultA, resultB]
  assert.ok(
    results.every((r) => r.ok),
    "les deux débits doivent réussir (solde suffisant pour les deux)",
  )

  const finalBalance = await readBalance(lostUpdateAgencyId)
  assert.equal(
    finalBalance,
    20,
    "le solde final doit refléter LES DEUX débits (100 - 40 - 40 = 20) — un solde de 60 signalerait un lost update",
  )

  const movements = await withSystemContext((tx) =>
    tx
      .select({ id: partnerCreditMovements.id })
      .from(partnerCreditMovements)
      .where(eq(partnerCreditMovements.agencyId, lostUpdateAgencyId)),
  )
  assert.equal(
    movements.length,
    2,
    "deux mouvements de débit distincts doivent avoir été insérés",
  )
})
