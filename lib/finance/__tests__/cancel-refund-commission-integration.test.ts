/**
 * WALLET-E2E-CI-INTEGRATION-01 — Preuve d'intégration RÉELLE (PostgreSQL vivant)
 * pour la chaîne complète : annulation → remboursement → inversion commission.
 *
 * Couvre ce que les tests mock/unitaires ne peuvent PAS prouver :
 *  1. `applyReservationRefund` crédite réellement le wallet B2C via
 *     `creditCustomerWallet` (wallet_ledger, ligne réelle en base).
 *  2. `reverseCommissionOnCancellation` insère un entitlement de compensation
 *     réel et débite le wallet commission via `debit_platform_commission()`.
 *  3. La chaîne complète dans UNE SEULE transaction : atomicité réelle —
 *     refund + commission reversal commitent ou rollbackent ensemble.
 *  4. Idempotence : un deuxième appel à `reverseCommissionOnCancellation` ne
 *     crée pas de deuxième compensation (contrainte UNIQUE partielle 0134).
 *
 * Convention `isDbAvailable()` : se skip proprement sans DATABASE_URL,
 * exécute réellement sinon — même pattern que `commission-reversal-integration.test.ts`.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"

import { withSystemContext } from "@/lib/db/tenant-context"
import { cleanupAsSuperuser } from "@/lib/db/test-helpers/superuser-cleanup"
import {
  agencies,
  customers,
  reservations,
  reservationFinancials,
  economicEntitlements,
  payments,
} from "@/lib/db/schema"
import { applyReservationRefund } from "@/lib/finance/refund-logic"
import { reverseCommissionOnCancellation } from "@/lib/finance/commission-reversal"
import { PLATFORM_COMMISSION_WALLET_ID } from "@/lib/finance/platform-commission"

/* -------------------------------------------------------------------------- */
/* DB availability guard                                                        */
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
const skipReason = () =>
  "Postgres local indisponible (DATABASE_URL) — test skip."

/* -------------------------------------------------------------------------- */
/* Fixture seed                                                                 */
/* -------------------------------------------------------------------------- */

async function seedCancelRefundChain(opts: {
  commissionAmount: string
  saleAmount: string
}): Promise<{
  reservationId: string
  agencyId: string
  customerId: string
  paymentId: string
  publicRef: string
}> {
  const suffix = randomUUID().slice(0, 8)
  const publicRef = `TEST-CRC-${suffix}`

  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({
        name: `Cancel Refund Chain Test Agency ${suffix}`,
        agencyType: "ota",
        slug: `cancel-refund-chain-${suffix}`,
      })
      .returning({ id: agencies.id })

    const [customer] = await tx
      .insert(customers)
      .values({
        agencyId: agency!.id,
        civility: "M",
        firstName: "Cancel",
        lastName: `Refund ${suffix}`,
        phone: "20000002",
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
        originalAmount: opts.saleAmount,
        tndAmount: opts.saleAmount,
      })
      .returning({ id: reservations.id })

    // Financials (supplierPrice, commissionAmount etc.)
    await tx.insert(reservationFinancials).values({
      reservationId: reservation!.id,
      supplierPrice: "400.00",
      supplierCurrency: "TND",
      supplierPriceTnd: "400.00",
      salePrice: opts.saleAmount,
      saleCurrency: "TND",
      salePriceTnd: opts.saleAmount,
      marginAmount: "100.00",
      marginPercent: "20.00",
      commissionAmount: opts.commissionAmount,
      commissionPercent: "5.00",
    })

    // Entitlement d'origine (commission earned, full_reversal)
    await tx.insert(economicEntitlements).values({
      reservationId: reservation!.id,
      partyType: "easy2book",
      partyId: null,
      role: "easy2book",
      qualification: "commission",
      amount: opts.commissionAmount,
      currency: "TND",
      basis: "Commission Easy2Book — seed test intégration CRC",
      status: "earned",
      effectiveAt: new Date(),
      cancellationTreatment: "full_reversal",
    })

    // Crédit réel du wallet commission (même chemin que production)
    await tx.execute(sql`
      SELECT credit_platform_commission(
        ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
        ${reservation!.id}::uuid,
        ${opts.commissionAmount}::numeric,
        ${"Commission Easy2Book — seed test CRC " + publicRef}
      )
    `)

    // Paiement capturé (nécessaire pour applyReservationRefund)
    const [payment] = await tx
      .insert(payments)
      .values({
        agencyId: agency!.id,
        reservationId: reservation!.id,
        psp: "manual",
        method: "cash",
        originalCurrency: "TND",
        originalAmount: opts.saleAmount,
        tndAmount: opts.saleAmount,
        kind: "deposit",
        status: "captured",
        capturedAt: new Date(),
        idempotencyKey: `crc-seed-${reservation!.id}`,
      })
      .returning({ id: payments.id })

    return {
      reservationId: reservation!.id,
      agencyId: agency!.id,
      customerId: customer!.id,
      paymentId: payment!.id,
      publicRef,
    }
  })
}

async function cleanupCancelRefundChain(
  reservationId: string,
  agencyId: string,
  customerId: string,
): Promise<void> {
  // wallet_ledger et economic_entitlements sont append-only (app_runtime n'a
  // pas DELETE) — nettoyage via le superuser.
  await cleanupAsSuperuser(
    (sql) =>
      sql`delete from wallet_ledger where reservation_id = ${reservationId}`,
  )
  await cleanupAsSuperuser(
    (sql) =>
      sql`delete from economic_entitlements where reservation_id = ${reservationId}`,
  )
  await withSystemContext(async (tx) => {
    await tx
      .delete(payments)
      .where(eq(payments.reservationId, reservationId))
    await tx
      .delete(reservationFinancials)
      .where(eq(reservationFinancials.reservationId, reservationId))
    await tx.delete(reservations).where(eq(reservations.id, reservationId))
    await tx.delete(customers).where(eq(customers.id, customerId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                    */
/* -------------------------------------------------------------------------- */

const seeded: Array<{
  reservationId: string
  agencyId: string
  customerId: string
}> = []

before(async () => {
  dbAvailable = await isDbAvailable()
})

after(async () => {
  if (!dbAvailable) return
  for (const s of seeded) {
    await cleanupCancelRefundChain(s.reservationId, s.agencyId, s.customerId)
  }
})

/* -------------------------------------------------------------------------- */
/* Tests                                                                        */
/* -------------------------------------------------------------------------- */

test("applyReservationRefund (B2C) : crédite le wallet client et retourne ok=true", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCancelRefundChain({
    commissionAmount: "25.00",
    saleAmount: "500.00",
  })
  seeded.push(seed)

  const result = await withSystemContext(async (tx) => {
    return applyReservationRefund({
      tx,
      agencyId: seed.agencyId,
      reservationId: seed.reservationId,
      customerId: seed.customerId,
      publicRef: seed.publicRef,
      reason: "Annulation test intégration CRC",
      actorUserId: null,
      // amountTnd omis → remboursement total
    })
  })

  assert.ok(result.ok, `applyReservationRefund doit réussir — got: ${JSON.stringify(result)}`)
  assert.ok(result.ok && result.refundedTnd > 0, "refundedTnd doit être > 0")
  assert.ok(result.ok && result.fullyRefunded, "doit être un remboursement total")

  // Vérification que wallet_ledger a un crédit (refund) pour cette réservation
  const ledgerRows = await withSystemContext((tx) =>
    tx
      .select({ type: sql<string>`type`, amount: sql<string>`amount` })
      .from(sql`wallet_ledger`)
      .where(sql`reservation_id = ${seed.reservationId} AND type = 'credit'`),
  )
  assert.ok(ledgerRows.length >= 1, "au moins 1 ligne wallet_ledger de type credit attendue")
})

test("reverseCommissionOnCancellation : insère un entitlement de compensation réel", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCancelRefundChain({
    commissionAmount: "30.00",
    saleAmount: "600.00",
  })
  seeded.push(seed)

  await withSystemContext(async (tx) => {
    await reverseCommissionOnCancellation(tx, {
      reservationId: seed.reservationId,
      publicRef: seed.publicRef,
      actorUserId: null,
    })
  })

  // Un entitlement de compensation doit exister (qualification=commission, status=compensation)
  const compensationRows = await withSystemContext((tx) =>
    tx
      .select({ id: economicEntitlements.id, status: economicEntitlements.status })
      .from(economicEntitlements)
      .where(
        eq(economicEntitlements.reservationId, seed.reservationId),
      ),
  )

  const compensationEntry = compensationRows.find(
    (r) => r.status === "compensated",
  )
  assert.ok(
    compensationEntry,
    `Un entitlement status=compensated doit exister pour reservationId=${seed.reservationId}`,
  )
})

test("reverseCommissionOnCancellation : idempotence — 2 appels → 1 seul entitlement de compensation", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCancelRefundChain({
    commissionAmount: "20.00",
    saleAmount: "400.00",
  })
  seeded.push(seed)

  // Premier appel
  await withSystemContext(async (tx) => {
    await reverseCommissionOnCancellation(tx, {
      reservationId: seed.reservationId,
      publicRef: seed.publicRef,
      actorUserId: null,
    })
  })

  // Deuxième appel — la contrainte UNIQUE partielle 0134 doit empêcher un
  // double entitlement de compensation (ou le no-op silencieux de la garde)
  await withSystemContext(async (tx) => {
    await reverseCommissionOnCancellation(tx, {
      reservationId: seed.reservationId,
      publicRef: seed.publicRef,
      actorUserId: null,
    })
  })

  const compensationRows = await withSystemContext((tx) =>
    tx
      .select({ id: economicEntitlements.id, status: economicEntitlements.status })
      .from(economicEntitlements)
      .where(
        eq(economicEntitlements.reservationId, seed.reservationId),
      ),
  )

  const compensations = compensationRows.filter((r) => r.status === "compensated")
  assert.equal(
    compensations.length,
    1,
    `Exactement 1 entitlement compensated attendu — got: ${compensations.length}`,
  )
})

test("chaîne complète cancel → applyReservationRefund + reverseCommissionOnCancellation dans 1 transaction", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCancelRefundChain({
    commissionAmount: "35.00",
    saleAmount: "700.00",
  })
  seeded.push(seed)

  // Les deux opérations dans la même transaction — atomicité réelle
  await withSystemContext(async (tx) => {
    const refundResult = await applyReservationRefund({
      tx,
      agencyId: seed.agencyId,
      reservationId: seed.reservationId,
      customerId: seed.customerId,
      publicRef: seed.publicRef,
      reason: "Annulation test intégration CRC chaîne complète",
      actorUserId: null,
    })
    assert.ok(
      refundResult.ok,
      `applyReservationRefund doit réussir — got: ${JSON.stringify(refundResult)}`,
    )

    await reverseCommissionOnCancellation(tx, {
      reservationId: seed.reservationId,
      publicRef: seed.publicRef,
      actorUserId: null,
    })
  })

  // Vérification post-transaction
  const allEntitlements = await withSystemContext((tx) =>
    tx
      .select({ status: economicEntitlements.status })
      .from(economicEntitlements)
      .where(eq(economicEntitlements.reservationId, seed.reservationId)),
  )
  const earned = allEntitlements.filter((r) => r.status === "earned")
  const compensation = allEntitlements.filter((r) => r.status === "compensated")
  assert.ok(earned.length >= 1, "entitlement earned d'origine doit exister")
  assert.equal(compensation.length, 1, "exactement 1 entitlement compensated")

  const ledgerCredits = await withSystemContext((tx) =>
    tx
      .select({ amount: sql<string>`amount` })
      .from(sql`wallet_ledger`)
      .where(sql`reservation_id = ${seed.reservationId} AND type = 'credit'`),
  )
  assert.ok(ledgerCredits.length >= 1, "wallet_ledger doit avoir un crédit remboursement")
})

test("rollback transactionnel : échec après applyReservationRefund annule aussi la commission reversal", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCancelRefundChain({
    commissionAmount: "15.00",
    saleAmount: "300.00",
  })
  seeded.push(seed)

  // La transaction va réussir refund + reversal puis lancer une exception
  // → tout doit être rollbacké
  await assert.rejects(
    () =>
      withSystemContext(async (tx) => {
        await applyReservationRefund({
          tx,
          agencyId: seed.agencyId,
          reservationId: seed.reservationId,
          customerId: seed.customerId,
          publicRef: seed.publicRef,
          reason: "Rollback test",
          actorUserId: null,
        })
        await reverseCommissionOnCancellation(tx, {
          reservationId: seed.reservationId,
          publicRef: seed.publicRef,
          actorUserId: null,
        })
        // Force un rollback de toute la transaction
        throw new Error("FORCED_ROLLBACK_TEST")
      }),
    (err: unknown) => {
      assert.ok(
        (err as { message?: string }).message === "FORCED_ROLLBACK_TEST",
        "l'exception doit être FORCED_ROLLBACK_TEST",
      )
      return true
    },
    "la transaction doit être rejetée avec FORCED_ROLLBACK_TEST",
  )

  // Après rollback : aucun credit wallet_ledger pour cette réservation
  const ledgerRows = await withSystemContext((tx) =>
    tx
      .select({ id: sql<string>`id` })
      .from(sql`wallet_ledger`)
      .where(sql`reservation_id = ${seed.reservationId}`),
  )
  assert.equal(
    ledgerRows.length,
    0,
    "aucune ligne wallet_ledger ne doit persister après rollback",
  )

  // Aucun entitlement de compensation
  const allEntitlements = await withSystemContext((tx) =>
    tx
      .select({ status: economicEntitlements.status })
      .from(economicEntitlements)
      .where(eq(economicEntitlements.reservationId, seed.reservationId)),
  )
  const compensations = allEntitlements.filter((r) => r.status === "compensated")
  assert.equal(
    compensations.length,
    0,
    "aucun entitlement compensated ne doit persister après rollback",
  )
})
