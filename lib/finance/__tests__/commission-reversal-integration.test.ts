/**
 * CANCEL-COMMISSION-01 — preuve d'intégration RÉELLE (PostgreSQL vivant) pour
 * `debit_platform_commission()` (migration 0133) et
 * `reverseCommissionOnCancellation()` (lib/finance/commission-reversal.ts),
 * en complément de `commission-reversal.test.ts` (mock-tx, décisions de code
 * uniquement, pas de garantie PostgreSQL réelle).
 *
 * Même convention `isDbAvailable()` que
 * `lib/finance/__tests__/customer-wallet-concurrency.test.ts` : se `skip`-ent
 * proprement sans `DATABASE_URL`, exécutent réellement sinon. Exécuté dans
 * cette session contre un Postgres 16 LOCAL AU CONTENEUR (`easyv4_e2e`,
 * créé par le bootstrap du conteneur, préexistant à cette session — jamais
 * la base Supabase de production référencée par `.env.local`), avec les
 * migrations 0133 et 0134 rejouées manuellement sur cette base locale
 * (jamais sur une base partagée ou de production — voir rapport d'audit
 * PR #200, section "Bloquant D").
 *
 * Couvre ce que le mock ne peut PAS prouver :
 *  1. `debit_platform_commission()` : idempotency_key réel (2 appels
 *     séquentiels, même clé → 1 seul débit).
 *  2. Garde solde négatif réelle (RAISE EXCEPTION Postgres, pas un mock).
 *  3. Concurrence RÉELLE : 2 appels SQL simultanés, même clé → `FOR UPDATE`
 *     sérialise, 1 seul débit (jamais 2).
 *  4. `reverseCommissionOnCancellation()` : 2 appels concurrents RÉELS pour
 *     la même réservation (2 connexions/transactions indépendantes, comme 2
 *     requêtes HTTP) → la contrainte UNIQUE partielle
 *     `economic_entitlements_compensates_uniq` (migration 0134) ferme pour de
 *     vrai la fenêtre de course que le mock ne pouvait que simuler.
 *  5. Rollback transactionnel complet : un échec APRÈS le débit SQL mais
 *     AVANT le commit de la même transaction annule aussi le débit (preuve
 *     directe de l'atomicité Postgres, indépendante du wrapper TypeScript).
 *  6. La contrainte UNIQUE elle-même (migration 0134), testée par un INSERT
 *     direct en double — indépendamment de tout code applicatif.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  reservationFinancials,
  economicEntitlements,
  walletAccounts,
  walletLedger,
} from "@/lib/db/schema"
import { reverseCommissionOnCancellation } from "../commission-reversal"
import { PLATFORM_COMMISSION_WALLET_ID } from "../platform-commission"

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
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — voir rapport d'audit PR #200, section Bloquant D."

async function readCommissionWalletBalance(): Promise<string> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ currentBalance: walletAccounts.currentBalance })
      .from(walletAccounts)
      .where(eq(walletAccounts.id, PLATFORM_COMMISSION_WALLET_ID))
    return row!.currentBalance
  })
}

/**
 * Crée une réservation complète (agence + client + réservation +
 * reservation_financials + entitlement d'origine 'commission'/'easy2book')
 * et crédite réellement le wallet commission via `credit_platform_commission()`
 * (même chemin que la production — pas une insertion directe qui
 * contournerait la fonction testée indirectement en amont).
 */
async function seedCommissionedReservation(opts: {
  commissionAmount: string
  cancellationTreatment: "full_reversal" | "non_refundable" | null
}): Promise<{
  reservationId: string
  agencyId: string
  originalEntitlementId: string
  publicRef: string
}> {
  const suffix = randomUUID().slice(0, 8)
  const publicRef = `TEST-CCR-${suffix}`
  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({
        name: `Commission Reversal Test Agency ${suffix}`,
        agencyType: "ota",
        slug: `commission-reversal-test-${suffix}`,
      })
      .returning({ id: agencies.id })
    const [customer] = await tx
      .insert(customers)
      .values({
        agencyId: agency!.id,
        civility: "M",
        firstName: "Commission",
        lastName: `Reversal ${suffix}`,
        phone: "20000001",
      })
      .returning({ id: customers.id })
    const [reservation] = await tx
      .insert(reservations)
      .values({
        agencyId: agency!.id,
        publicRef,
        customerId: customer!.id,
        module: "hotel",
        source: "manual",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "500.00",
        tndAmount: "500.00",
      })
      .returning({ id: reservations.id })

    await tx.insert(reservationFinancials).values({
      reservationId: reservation!.id,
      supplierPrice: "400.00",
      supplierCurrency: "TND",
      supplierPriceTnd: "400.00",
      salePrice: "500.00",
      saleCurrency: "TND",
      salePriceTnd: "500.00",
      marginAmount: "100.00",
      marginPercent: "20.00",
      commissionAmount: opts.commissionAmount,
      commissionPercent: "5.00",
    })

    const [originalEntitlement] = await tx
      .insert(economicEntitlements)
      .values({
        reservationId: reservation!.id,
        partyType: "easy2book",
        partyId: null,
        role: "easy2book",
        qualification: "commission",
        amount: opts.commissionAmount,
        currency: "TND",
        basis: "Commission Easy2Book — seed test intégration",
        status: "earned",
        effectiveAt: new Date(),
        cancellationTreatment: opts.cancellationTreatment,
      })
      .returning({ id: economicEntitlements.id })

    // Crédit réel du wallet commission — même fonction SQL que la production
    // (lib/finance/platform-commission.ts::creditPlatformCommission).
    await tx.execute(sql`
      SELECT credit_platform_commission(
        ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
        ${reservation!.id}::uuid,
        ${opts.commissionAmount}::numeric,
        ${"Commission Easy2Book — seed test intégration " + publicRef}
      )
    `)

    return {
      reservationId: reservation!.id,
      agencyId: agency!.id,
      originalEntitlementId: originalEntitlement!.id,
      publicRef,
    }
  })
}

async function cleanupReservation(
  reservationId: string,
  agencyId: string,
): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx
      .delete(walletLedger)
      .where(eq(walletLedger.reservationId, reservationId))
    await tx
      .delete(economicEntitlements)
      .where(eq(economicEntitlements.reservationId, reservationId))
    await tx
      .delete(reservationFinancials)
      .where(eq(reservationFinancials.reservationId, reservationId))
    const [reservation] = await tx
      .select({ customerId: reservations.customerId })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
    await tx.delete(reservations).where(eq(reservations.id, reservationId))
    if (reservation) {
      await tx.delete(customers).where(eq(customers.id, reservation.customerId))
    }
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
}

before(async () => {
  dbAvailable = await isDbAvailable()
})

const seeded: Array<{ reservationId: string; agencyId: string }> = []
after(async () => {
  if (!dbAvailable) return
  for (const s of seeded) {
    await cleanupReservation(s.reservationId, s.agencyId)
  }
})

test("debit_platform_commission() : idempotency_key réelle — 2 appels séquentiels même clé → 1 seul débit", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCommissionedReservation({
    commissionAmount: "30.00",
    cancellationTreatment: "full_reversal",
  })
  seeded.push(seed)

  const balanceBefore = await readCommissionWalletBalance()
  const idempotencyKey = `integration-test-seq:${seed.reservationId}`

  await withSystemContext((tx) =>
    tx.execute(sql`
      SELECT debit_platform_commission(
        ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
        ${seed.reservationId}::uuid,
        30.00::numeric,
        'intégration — premier appel',
        ${idempotencyKey}
      )
    `),
  )
  // Deuxième appel, MÊME clé — doit être un no-op silencieux (RETURN précoce
  // dans 0133_debit_platform_commission.sql), pas une erreur.
  await withSystemContext((tx) =>
    tx.execute(sql`
      SELECT debit_platform_commission(
        ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
        ${seed.reservationId}::uuid,
        30.00::numeric,
        'intégration — second appel (retry)',
        ${idempotencyKey}
      )
    `),
  )

  const balanceAfter = await readCommissionWalletBalance()
  assert.equal(
    (Number(balanceBefore) - Number(balanceAfter)).toFixed(2),
    "30.00",
    "le solde ne doit baisser que d'UN seul débit de 30.00, jamais 60.00",
  )

  const ledgerRows = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .where(eq(walletLedger.idempotencyKey, idempotencyKey)),
  )
  assert.equal(
    ledgerRows.length,
    1,
    "une seule ligne wallet_ledger doit exister pour cette clé d'idempotence",
  )
})

test("debit_platform_commission() : garde solde négatif réelle — débit > solde disponible → exception Postgres, aucun état modifié", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const balanceBefore = await readCommissionWalletBalance()
  const hugeAmount = (Number(balanceBefore) + 1_000_000).toFixed(2)
  const idempotencyKey = `integration-test-negative:${randomUUID()}`

  await assert.rejects(
    () =>
      withSystemContext((tx) =>
        tx.execute(sql`
          SELECT debit_platform_commission(
            ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
            ${randomUUID()}::uuid,
            ${hugeAmount}::numeric,
            'intégration — doit échouer (solde insuffisant)',
            ${idempotencyKey}
          )
        `),
      ),
    (err: unknown) => {
      // postgres-js : le message Postgres réel (RAISE EXCEPTION) vit sur
      // `.cause.message`, pas sur `.message` (qui ne contient que "Failed
      // query: ..." côté driver) — confirmé par diagnostic direct contre ce
      // Postgres local.
      const causeMessage = (err as { cause?: { message?: string } })?.cause
        ?.message
      assert.ok(
        causeMessage?.includes("INSUFFICIENT_COMMISSION_BALANCE"),
        `doit lever INSUFFICIENT_COMMISSION_BALANCE, jamais passer le solde en négatif — reçu cause.message: ${causeMessage}`,
      )
      return true
    },
  )

  const balanceAfter = await readCommissionWalletBalance()
  assert.equal(
    balanceAfter,
    balanceBefore,
    "le solde doit rester strictement inchangé après une tentative rejetée",
  )

  const ledgerRows = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .where(eq(walletLedger.idempotencyKey, idempotencyKey)),
  )
  assert.equal(
    ledgerRows.length,
    0,
    "aucune ligne wallet_ledger ne doit avoir été insérée pour une tentative rejetée",
  )
})

test("debit_platform_commission() : 2 appels SQL CONCURRENTS (même clé d'idempotence) — FOR UPDATE sérialise, 1 seul débit réel", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCommissionedReservation({
    commissionAmount: "40.00",
    cancellationTreatment: "full_reversal",
  })
  seeded.push(seed)

  const balanceBefore = await readCommissionWalletBalance()
  const idempotencyKey = `integration-test-concurrent-debit:${seed.reservationId}`

  const call = () =>
    withSystemContext((tx) =>
      tx.execute(sql`
        SELECT debit_platform_commission(
          ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
          ${seed.reservationId}::uuid,
          40.00::numeric,
          'intégration — appel concurrent',
          ${idempotencyKey}
        )
      `),
    )

  // Deux VRAIES transactions/connexions indépendantes, lancées simultanément
  // — comme deux requêtes HTTP concurrentes réelles (même convention que
  // customer-wallet-concurrency.test.ts).
  await Promise.all([call(), call()])

  const balanceAfter = await readCommissionWalletBalance()
  assert.equal(
    (Number(balanceBefore) - Number(balanceAfter)).toFixed(2),
    "40.00",
    "deux appels concurrents avec la MÊME clé ne doivent débiter qu'UNE fois (40.00), jamais 80.00 — preuve réelle du FOR UPDATE + idempotency_key, pas un mock",
  )

  const ledgerRows = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .where(eq(walletLedger.idempotencyKey, idempotencyKey)),
  )
  assert.equal(
    ledgerRows.length,
    1,
    "une seule ligne wallet_ledger doit exister malgré les deux appels concurrents",
  )
})

test("reverseCommissionOnCancellation() : 2 appels CONCURRENTS réels pour la MÊME réservation → 1 seule compensation, 1 seul débit (preuve réelle migration 0134)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCommissionedReservation({
    commissionAmount: "25.00",
    cancellationTreatment: "full_reversal",
  })
  seeded.push(seed)

  const balanceBefore = await readCommissionWalletBalance()

  const call = () =>
    withSystemContext((tx) =>
      reverseCommissionOnCancellation(tx, {
        reservationId: seed.reservationId,
        publicRef: seed.publicRef,
        actorUserId: null,
      }),
    )

  // Deux appels concurrents RÉELS — deux connexions/transactions distinctes.
  // Sans la contrainte UNIQUE `economic_entitlements_compensates_uniq`
  // (migration 0134), le SELECT puis INSERT applicatif (étape 4 de
  // commission-reversal.ts) laisserait passer les deux : chaque transaction
  // peut voir "aucune compensation" avant que l'autre ne committe la sienne.
  await Promise.all([call(), call()])

  const balanceAfter = await readCommissionWalletBalance()
  assert.equal(
    (Number(balanceBefore) - Number(balanceAfter)).toFixed(2),
    "25.00",
    "le débit réel ne doit avoir lieu qu'UNE fois malgré les deux appels concurrents",
  )

  const compensations = await withSystemContext((tx) =>
    tx
      .select({ id: economicEntitlements.id })
      .from(economicEntitlements)
      .where(
        eq(economicEntitlements.compensatesId, seed.originalEntitlementId),
      ),
  )
  assert.equal(
    compensations.length,
    1,
    "une seule ligne compensatoire economic_entitlements doit exister — jamais deux, même sous course réelle",
  )
})

test("échec APRÈS un débit SQL réussi, AVANT commit de la même transaction → rollback complet (aucune trace du débit)", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const balanceBefore = await readCommissionWalletBalance()
  const idempotencyKey = `integration-test-rollback:${randomUUID()}`
  const fakeReservationId = randomUUID()

  // Preuve directe de l'atomicité Postgres (indépendante du wrapper
  // TypeScript) : à l'intérieur d'UNE SEULE transaction, un débit SQL réussi
  // suivi d'une erreur PLUS TARD dans la même transaction doit annuler aussi
  // le débit au ROLLBACK — exactement le scénario "échec entre le débit et
  // l'insertion de la compensation" demandé par l'audit.
  await assert.rejects(
    () =>
      withSystemContext(async (tx) => {
        await tx.execute(sql`
          SELECT debit_platform_commission(
            ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
            ${fakeReservationId}::uuid,
            10.00::numeric,
            'intégration — débit avant échec simulé',
            ${idempotencyKey}
          )
        `)
        // Erreur déclenchée APRÈS le débit, dans la MÊME transaction —
        // simule un échec applicatif entre l'étape A (débit) et l'étape B
        // (insertion compensatoire) de reverseCommissionOnCancellation().
        await tx.execute(sql`SELECT 1 / 0`)
      }),
    (err: unknown) => {
      const causeMessage = (err as { cause?: { message?: string } })?.cause
        ?.message
      assert.ok(
        causeMessage?.includes("division by zero"),
        `attendu 'division by zero' sur cause.message, reçu: ${causeMessage}`,
      )
      return true
    },
  )

  const balanceAfter = await readCommissionWalletBalance()
  assert.equal(
    balanceAfter,
    balanceBefore,
    "le ROLLBACK doit annuler le débit déjà exécuté dans la même transaction — aucun état partiel",
  )

  const ledgerRows = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .where(eq(walletLedger.idempotencyKey, idempotencyKey)),
  )
  assert.equal(
    ledgerRows.length,
    0,
    "aucune ligne wallet_ledger ne doit survivre à un ROLLBACK, même si le débit avait réussi avant l'échec",
  )
})

test("migration 0134 — contrainte UNIQUE economic_entitlements_compensates_uniq : INSERT direct en double → rejeté (23505), indépendamment de tout code applicatif", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCommissionedReservation({
    commissionAmount: "15.00",
    cancellationTreatment: "full_reversal",
  })
  seeded.push(seed)

  // Premier INSERT compensatoire direct — doit réussir.
  await withSystemContext((tx) =>
    tx.insert(economicEntitlements).values({
      reservationId: seed.reservationId,
      partyType: "easy2book",
      partyId: null,
      role: "easy2book",
      qualification: "commission",
      amount: "-15.00",
      currency: "TND",
      basis: "intégration — première compensation directe",
      status: "pending",
      effectiveAt: new Date(),
      compensatesId: seed.originalEntitlementId,
      cancellationTreatment: "full_reversal",
    }),
  )

  // Second INSERT direct, MÊME compensatesId — doit être rejeté par la
  // contrainte UNIQUE partielle de la migration 0134, pas par du code
  // applicatif (preuve que le filet de sécurité DB existe réellement une
  // fois la migration appliquée, pas seulement sur le papier).
  await assert.rejects(
    () =>
      withSystemContext((tx) =>
        tx.insert(economicEntitlements).values({
          reservationId: seed.reservationId,
          partyType: "easy2book",
          partyId: null,
          role: "easy2book",
          qualification: "commission",
          amount: "-15.00",
          currency: "TND",
          basis: "intégration — seconde compensation directe (doit échouer)",
          status: "pending",
          effectiveAt: new Date(),
          compensatesId: seed.originalEntitlementId,
          cancellationTreatment: "full_reversal",
        }),
      ),
    (err: unknown) => {
      const code = (err as { cause?: { code?: string } })?.cause?.code
      assert.equal(
        code,
        "23505",
        `doit échouer avec le code Postgres 23505 (violation unique), reçu: ${code}`,
      )
      return true
    },
  )

  const compensations = await withSystemContext((tx) =>
    tx
      .select({ id: economicEntitlements.id })
      .from(economicEntitlements)
      .where(
        eq(economicEntitlements.compensatesId, seed.originalEntitlementId),
      ),
  )
  assert.equal(
    compensations.length,
    1,
    "exactement une compensation doit exister après le rejet du doublon",
  )
})
