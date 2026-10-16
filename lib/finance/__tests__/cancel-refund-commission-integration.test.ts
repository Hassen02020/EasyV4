/**
 * WALLET-E2E-CI-INTEGRATION-01 — Preuve d'intégration RÉELLE (PostgreSQL vivant)
 * pour la chaîne complète : annulation → remboursement → inversion commission.
 *
 * Couvre ce que les tests mock/unitaires ne peuvent PAS prouver :
 *  1. `applyReservationRefund` crédite réellement le wallet B2C via
 *     `creditCustomerWallet` (wallet_ledger ligne réelle, aucun mock).
 *  2. `reverseCommissionOnCancellation` insère un entitlement compensated réel
 *     et débite le wallet commission via `debit_platform_commission()`.
 *  3. La chaîne complète dans UNE SEULE transaction : atomicité réelle —
 *     refund + commission reversal commitent ou rollbackent ensemble.
 *  4. Idempotence : un 2ème appel à `reverseCommissionOnCancellation` ne
 *     crée pas de 2ème débit commission (contrainte UNIQUE partielle 0134).
 *
 * Isolation financière :
 *  - Test 1 n'implique PAS le wallet commission (fixture sans credit_platform_commission).
 *  - Tests 2–5 créditent puis débitent le wallet commission — net nul sauf
 *    rollback (test 5). Le cleanup restaure toujours le solde commission avant
 *    de supprimer les lignes ledger, garantissant solde = Σ(ledger) après nettoyage.
 *
 * Convention `isDbAvailable()` : skip proprement sans DATABASE_URL,
 * exécute réellement sinon. Base cible : PostgreSQL éphémère du workflow CI
 * (`DATABASE_URL` + `DATABASE_DIRECT_URL` pointent sur localhost — refus
 * automatique par `cleanupAsSuperuser` si hôte ≠ localhost/127.0.0.1/::1).
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"

import { withSystemContext } from "@/lib/db/tenant-context"
import { cleanupAsSuperuser } from "@/lib/db/test-helpers/superuser-cleanup"
import {
  agencies,
  customers,
  reservations,
  reservationFinancials,
  economicEntitlements,
  payments,
  walletLedger,
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
  "Postgres local indisponible (DATABASE_URL) — test skip proprement."

/* -------------------------------------------------------------------------- */
/* Fixture A — remboursement seul (aucun crédit wallet commission)             */
/* -------------------------------------------------------------------------- */
// Utilisée par le test 1 qui isole `applyReservationRefund` sans toucher
// au wallet commission global.

async function seedRefundOnly(opts: { saleAmount: string }): Promise<{
  reservationId: string
  agencyId: string
  customerId: string
  publicRef: string
}> {
  const suffix = randomUUID().slice(0, 8)
  const publicRef = `TEST-RFO-${suffix}`

  return withSystemContext(async (tx) => {
    const [agency] = await tx
      .insert(agencies)
      .values({
        name: `Refund Only Test Agency ${suffix}`,
        agencyType: "ota",
        slug: `refund-only-${suffix}`,
      })
      .returning({ id: agencies.id })

    const [customer] = await tx
      .insert(customers)
      .values({
        agencyId: agency!.id,
        civility: "M",
        firstName: "Refund",
        lastName: `Only ${suffix}`,
        phone: "20000003",
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
      commissionAmount: "25.00",
      commissionPercent: "5.00",
    })

    // Paiement capturé — nécessaire pour applyReservationRefund
    await tx.insert(payments).values({
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
      idempotencyKey: `rfo-seed-${reservation!.id}`,
    })

    // Pas d'appel à credit_platform_commission() : ce test isole
    // applyReservationRefund sans modifier le wallet commission global.

    return {
      reservationId: reservation!.id,
      agencyId: agency!.id,
      customerId: customer!.id,
      publicRef,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Fixture B — chaîne complète (avec crédit wallet commission)                 */
/* -------------------------------------------------------------------------- */
// Utilisée par les tests 2–5 qui testent reverseCommissionOnCancellation.
// debit_platform_commission() lève EXCEPTION si solde insuffisant —
// le crédit préalable est donc obligatoire.

async function seedCancelRefundChain(opts: {
  commissionAmount: string
  saleAmount: string
}): Promise<{
  reservationId: string
  agencyId: string
  customerId: string
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

    // Crédit réel du wallet commission — même fonction SQL que la production
    // (credit_platform_commission), obligatoire avant debit_platform_commission
    await tx.execute(sql`
      SELECT credit_platform_commission(
        ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
        ${reservation!.id}::uuid,
        ${opts.commissionAmount}::numeric,
        ${"Commission Easy2Book — seed test CRC " + publicRef}
      )
    `)

    // Paiement capturé — nécessaire pour applyReservationRefund
    await tx.insert(payments).values({
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

    return {
      reservationId: reservation!.id,
      agencyId: agency!.id,
      customerId: customer!.id,
      publicRef,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Cleanup — restauration solde commission + suppression fixtures              */
/* -------------------------------------------------------------------------- */
// INVARIANT : le cleanup doit toujours laisser wallet_accounts.current_balance
// cohérent avec Σ(wallet_ledger) APRÈS suppression des lignes.
// Étape 1 : soustraire l'effet net de cette réservation sur le solde commission
//           (= Σ credits − Σ débits pour ce reservation_id sur le wallet
//           PLATFORM_COMMISSION_WALLET_ID). Net nul pour les tests 2–4 (crédit
//           + débit); +commissionAmount pour le test 5 (débit rollbacké).
// Étape 2 : supprimer les lignes wallet_ledger (tables append-only).
// Étape 3 : supprimer les entitlements et le reste des tables.

async function cleanupChain(
  reservationId: string,
  agencyId: string,
  customerId: string,
): Promise<void> {
  // 1. Restaurer le solde wallet commission (no-op si aucune ligne commission
  //    pour ce reservationId — cas fixture A / seedRefundOnly)
  await cleanupAsSuperuser(
    (sql) => sql`
      UPDATE wallet_accounts
      SET current_balance = (
        current_balance::numeric
        - COALESCE((
            SELECT SUM(amount::numeric)
            FROM wallet_ledger
            WHERE reservation_id = ${reservationId}
              AND wallet_account_id = ${PLATFORM_COMMISSION_WALLET_ID}
          ), 0)
      )
      WHERE id = ${PLATFORM_COMMISSION_WALLET_ID}
    `,
  )

  // 2. Supprimer les lignes wallet_ledger (append-only — superuser requis)
  await cleanupAsSuperuser(
    (sql) =>
      sql`DELETE FROM wallet_ledger WHERE reservation_id = ${reservationId}`,
  )

  // 3. Supprimer les entitlements (append-only — superuser requis)
  await cleanupAsSuperuser(
    (sql) =>
      sql`DELETE FROM economic_entitlements WHERE reservation_id = ${reservationId}`,
  )

  // 4. Supprimer audit_events (FK audit_events.agency_id → agencies.id bloque le DELETE agency)
  await cleanupAsSuperuser(
    (sql) => sql`DELETE FROM audit_events WHERE agency_id = ${agencyId}::uuid`,
  )

  // 5. Supprimer le reste via app_runtime (RLS actif, pas de DELETE sensible)
  await withSystemContext(async (tx) => {
    await tx.delete(payments).where(eq(payments.reservationId, reservationId))
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
    await cleanupChain(s.reservationId, s.agencyId, s.customerId)
  }
})

/* -------------------------------------------------------------------------- */
/* Test 1 — applyReservationRefund (B2C, sans impact wallet commission)        */
/* -------------------------------------------------------------------------- */
// Fixture A : pas de credit_platform_commission() — aucun effet sur le solde
// commission global. On prouve uniquement que applyReservationRefund crédite
// le wallet client B2C via creditCustomerWallet.

test("applyReservationRefund (B2C) : crédite le wallet client et retourne ok=true, sans toucher au wallet commission", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedRefundOnly({ saleAmount: "500.00" })
  seeded.push(seed)

  // Compter les lignes wallet commission AVANT — doit rester à 0
  const commissionRowsBefore = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.reservationId, seed.reservationId),
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
        ),
      ),
  )
  assert.equal(
    commissionRowsBefore.length,
    0,
    "aucune ligne commission wallet avant le test (fixture A sans crédit commission)",
  )

  const result = await withSystemContext(async (tx) => {
    return applyReservationRefund({
      tx,
      agencyId: seed.agencyId,
      reservationId: seed.reservationId,
      customerId: seed.customerId,
      publicRef: seed.publicRef,
      reason: "Annulation test intégration RFO",
      actorUserId: null,
      // amountTnd omis → remboursement total du paiement capturé
    })
  })

  assert.ok(
    result.ok,
    `applyReservationRefund doit réussir — got: ${JSON.stringify(result)}`,
  )
  assert.ok(result.ok && result.refundedTnd > 0, "refundedTnd doit être > 0")
  assert.ok(
    result.ok && result.fullyRefunded,
    "doit être un remboursement total",
  )

  // Le crédit client doit exister dans wallet_ledger
  const customerLedgerRows = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id, type: walletLedger.type })
      .from(walletLedger)
      .where(eq(walletLedger.reservationId, seed.reservationId)),
  )
  const clientCredits = customerLedgerRows.filter((r) => r.type === "credit")
  assert.equal(
    clientCredits.length,
    1,
    "exactement 1 ligne wallet_ledger credit attendue pour le wallet client",
  )

  // Le wallet commission ne doit pas avoir été touché
  const commissionRowsAfter = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.reservationId, seed.reservationId),
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
        ),
      ),
  )
  assert.equal(
    commissionRowsAfter.length,
    0,
    "wallet commission non modifié par applyReservationRefund",
  )
})

/* -------------------------------------------------------------------------- */
/* Test 2 — reverseCommissionOnCancellation : entitlement + débit wallet       */
/* -------------------------------------------------------------------------- */

test("reverseCommissionOnCancellation : insère 1 entitlement compensated et 1 débit wallet commission", async (t) => {
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

  // Un entitlement compensated doit exister
  const allEntitlements = await withSystemContext((tx) =>
    tx
      .select({
        id: economicEntitlements.id,
        status: economicEntitlements.status,
      })
      .from(economicEntitlements)
      .where(eq(economicEntitlements.reservationId, seed.reservationId)),
  )
  const compensated = allEntitlements.filter((r) => r.status === "pending")
  assert.equal(
    compensated.length,
    1,
    `exactement 1 entitlement compensated (status=pending) attendu — got: ${compensated.length}`,
  )

  // Le wallet commission doit avoir exactement 1 crédit (seed) + 1 débit (reversal)
  const commissionRows = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id, type: walletLedger.type })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.reservationId, seed.reservationId),
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
        ),
      ),
  )
  const commissionCredits = commissionRows.filter(
    (r) => r.type === "commission",
  )
  const commissionDebits = commissionRows.filter((r) => r.type === "adjustment")
  assert.equal(commissionCredits.length, 1, "1 crédit commission (seed)")
  assert.equal(commissionDebits.length, 1, "1 débit commission (reversal)")
})

/* -------------------------------------------------------------------------- */
/* Test 3 — Idempotence : 2 appels → 1 seul compensation + 1 seul débit       */
/* -------------------------------------------------------------------------- */

test("reverseCommissionOnCancellation : idempotence — 2 appels → 1 entitlement compensated et 1 débit wallet", async (t) => {
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

  // Deuxième appel — la contrainte UNIQUE partielle 0134 (ou garde interne)
  // doit empêcher un double entitlement et un double débit
  await withSystemContext(async (tx) => {
    await reverseCommissionOnCancellation(tx, {
      reservationId: seed.reservationId,
      publicRef: seed.publicRef,
      actorUserId: null,
    })
  })

  // Exactement 1 entitlement compensated
  const allEntitlements = await withSystemContext((tx) =>
    tx
      .select({ status: economicEntitlements.status })
      .from(economicEntitlements)
      .where(eq(economicEntitlements.reservationId, seed.reservationId)),
  )
  const compensated = allEntitlements.filter((r) => r.status === "pending")
  assert.equal(
    compensated.length,
    1,
    `Exactement 1 entitlement compensated (status=pending) attendu après 2 appels — got: ${compensated.length}`,
  )

  // Exactement 1 débit commission wallet (pas de double-débit)
  const commissionDebits = await withSystemContext((tx) =>
    tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.reservationId, seed.reservationId),
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
          eq(walletLedger.type, "adjustment"),
        ),
      ),
  )
  assert.equal(
    commissionDebits.length,
    1,
    `Exactement 1 débit commission attendu après 2 appels — got: ${commissionDebits.length}`,
  )
})

/* -------------------------------------------------------------------------- */
/* Test 4 — Chaîne complète dans 1 transaction : atomicité                     */
/* -------------------------------------------------------------------------- */
// applyReservationRefund + reverseCommissionOnCancellation dans la même tx.
// On distingue les écritures de fixture (crédit commission seed) des écritures
// produites par la transaction testée (crédit client + débit commission).

test("chaîne complète cancel → applyReservationRefund + reverseCommissionOnCancellation dans 1 transaction", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCancelRefundChain({
    commissionAmount: "35.00",
    saleAmount: "700.00",
  })
  seeded.push(seed)

  // Snapshot avant : seul le crédit commission seed existe
  const ledgerBefore = await withSystemContext((tx) =>
    tx
      .select({
        id: walletLedger.id,
        type: walletLedger.type,
        walletAccountId: walletLedger.walletAccountId,
      })
      .from(walletLedger)
      .where(eq(walletLedger.reservationId, seed.reservationId)),
  )
  assert.equal(
    ledgerBefore.length,
    1,
    "avant tx : exactement 1 ligne ledger (crédit commission seed)",
  )
  assert.equal(
    ledgerBefore[0]?.walletAccountId,
    PLATFORM_COMMISSION_WALLET_ID,
    "c'est bien le crédit commission",
  )
  assert.equal(ledgerBefore[0]?.type, "commission", "de type commission")

  // Les deux opérations dans la MÊME transaction — atomicité réelle
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
      `applyReservationRefund doit réussir dans la tx — got: ${JSON.stringify(refundResult)}`,
    )

    await reverseCommissionOnCancellation(tx, {
      reservationId: seed.reservationId,
      publicRef: seed.publicRef,
      actorUserId: null,
    })
  })

  // Snapshot après : 3 lignes — crédit commission (seed) + crédit client (refund) + débit commission (reversal)
  const ledgerAfter = await withSystemContext((tx) =>
    tx
      .select({
        id: walletLedger.id,
        type: walletLedger.type,
        walletAccountId: walletLedger.walletAccountId,
      })
      .from(walletLedger)
      .where(eq(walletLedger.reservationId, seed.reservationId)),
  )
  const clientCredits = ledgerAfter.filter(
    (r) =>
      r.walletAccountId !== PLATFORM_COMMISSION_WALLET_ID &&
      r.type === "credit",
  )
  const commissionCredits = ledgerAfter.filter(
    (r) =>
      r.walletAccountId === PLATFORM_COMMISSION_WALLET_ID &&
      r.type === "commission",
  )
  const commissionDebits = ledgerAfter.filter(
    (r) =>
      r.walletAccountId === PLATFORM_COMMISSION_WALLET_ID &&
      r.type === "adjustment",
  )
  assert.equal(clientCredits.length, 1, "1 crédit client (remboursement B2C)")
  assert.equal(
    commissionCredits.length,
    1,
    "1 crédit commission (seed inchangé)",
  )
  assert.equal(commissionDebits.length, 1, "1 débit commission (reversal)")

  // Entitlements : 1 earned (seed) + 1 compensated (reversal)
  const allEntitlements = await withSystemContext((tx) =>
    tx
      .select({ status: economicEntitlements.status })
      .from(economicEntitlements)
      .where(eq(economicEntitlements.reservationId, seed.reservationId)),
  )
  assert.ok(
    allEntitlements.some((r) => r.status === "earned"),
    "entitlement earned d'origine doit exister",
  )
  assert.equal(
    allEntitlements.filter((r) => r.status === "pending").length,
    1,
    "exactement 1 entitlement compensated (status=pending)",
  )
})

/* -------------------------------------------------------------------------- */
/* Test 5 — Rollback transactionnel : refund + reversal annulés ensemble       */
/* -------------------------------------------------------------------------- */
// La fixture crée 1 crédit commission (seed, transaction séparée).
// La transaction testée exécute refund + reversal puis lève une exception.
// Après rollback : seule la ligne de seed doit subsister dans wallet_ledger
// (le crédit client et le débit commission ont été rollbackés).

test("rollback transactionnel : refund + reversal annulés ensemble — seule la ligne seed commission persiste", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const seed = await seedCancelRefundChain({
    commissionAmount: "15.00",
    saleAmount: "300.00",
  })
  seeded.push(seed)

  // La transaction va réussir refund + reversal puis lever une exception
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
        // Force le rollback de toute la transaction
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

  // Après rollback : toutes les lignes wallet_ledger pour cette réservation
  const allLedger = await withSystemContext((tx) =>
    tx
      .select({
        id: walletLedger.id,
        type: walletLedger.type,
        walletAccountId: walletLedger.walletAccountId,
      })
      .from(walletLedger)
      .where(eq(walletLedger.reservationId, seed.reservationId)),
  )

  // Le crédit client (wallet B2C) a été rollbacké → 0 lignes côté client
  const clientRows = allLedger.filter(
    (r) => r.walletAccountId !== PLATFORM_COMMISSION_WALLET_ID,
  )
  assert.equal(
    clientRows.length,
    0,
    "aucun crédit wallet client ne doit persister après rollback",
  )

  // Le débit commission a été rollbacké → seul le crédit seed subsiste
  const commissionRows = allLedger.filter(
    (r) => r.walletAccountId === PLATFORM_COMMISSION_WALLET_ID,
  )
  assert.equal(
    commissionRows.length,
    1,
    "seul le crédit commission de la fixture doit subsister (le débit rollbacké a disparu)",
  )
  assert.equal(
    commissionRows[0]?.type,
    "commission",
    "la ligne commission restante est bien de type commission (seed, pas le débit rollbacké)",
  )

  // Aucun entitlement compensated (le reversal a été rollbacké)
  const allEntitlements = await withSystemContext((tx) =>
    tx
      .select({ status: economicEntitlements.status })
      .from(economicEntitlements)
      .where(eq(economicEntitlements.reservationId, seed.reservationId)),
  )
  const compensated = allEntitlements.filter((r) => r.status === "compensated")
  assert.equal(
    compensated.length,
    0,
    "aucun entitlement compensated ne doit persister après rollback",
  )
})
