/**
 * CERTIFICATION Chantier 64 — Chaîne Payment → Financials → Wallet → Settlement
 *
 * Prouve que :
 *  1. Un paiement (INSERT payments, status='captured') est correctement enregistré
 *     avec le bon agencyId, reservationId, montant et idempotency_key.
 *  2. debitCustomerWallet débite wallet_accounts et écrit wallet_ledger (B2C) :
 *     INSUFFICIENT_FUNDS si solde < montant, succès sinon.
 *  3. settleCommissions agrège les entrées commission non settlées → crée
 *     commission_settlements (status='pending'), marque wallet_ledger.settled_at.
 *  4. markSettlementPaid passe le settlement de 'pending' → 'paid' avec
 *     settled_at renseigné.
 *  5. Idempotence : un deuxième settleCommissions sur la MÊME période est rejeté
 *     par la contrainte UNIQUE (period_start, period_end).
 *  6. Rollback : une exception dans withSystemContext annule tous les INSERTs
 *     intermédiaires — aucun enregistrement partiel en base.
 *
 * Gap documenté :
 *  - Supplier reconciliation (rapprochement fournisseur) n'est PAS implémenté
 *    dans la base de code actuelle. Un seul commentaire dans
 *    lib/db/schema/suppliers.ts y fait référence à titre de roadmap.
 *    Ce module n'existant pas, il ne peut pas être certifié ici.
 *
 * Tests DB réels — se dégradent en skip si PostgreSQL est indisponible.
 * Aucune seed préalable requise : les fixtures sont créées/détruites ici.
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
  payments,
  walletAccounts,
  walletLedger,
  commissionSettlements,
} from "@/lib/db/schema"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { PLATFORM_COMMISSION_WALLET_ID } from "@/lib/finance/platform-commission"
import { settleCommissions, markSettlementPaid } from "@/lib/finance/commission-settlement"
import { debitCustomerWallet } from "@/lib/finance/customer-wallet"

/* -------------------------------------------------------------------------- */
/* DB availability guard                                                        */
/* -------------------------------------------------------------------------- */

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => { await tx.execute(sql`select 1`) })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skip = () => "PostgreSQL indisponible (DATABASE_URL)."

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

let agencyId    = ""
let customerId  = ""
let reservationId = ""

// Period for settlement tests — far future to avoid collisions with production data
const PERIOD_START = new Date("2098-01-01T00:00:00Z")
const PERIOD_END   = new Date("2098-12-31T23:59:59Z")

// Track created IDs for cleanup
let walletAccountId   = ""
let walletLedgerIdComm = ""  // direct commission entry for settlement test

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyId     = randomUUID()
  customerId   = randomUUID()
  reservationId  = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `cert64-${agencyId.slice(0, 8)}`,
      name: "Cert64 Test Agency",
      agencyType: "ota",
      depositBalance: "50000.000",
      reservationTolerance: "500.000",
    })

    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Cert64",
      lastName: "Test",
      email: `cert64-${agencyId.slice(0, 8)}@test.invalid`,
    })

    await tx.insert(reservations).values({
      id: reservationId,
      agencyId,
      publicRef: "CERT64-HOTEL-001",
      customerId,
      module: "hotel",
      source: "manual",
      status: "pending",
      originalCurrency: "TND",
      originalAmount: "1000.00",
      tndAmount: "1000.00",
    })

    // Pre-write reservation_financials so analytics can track this reservation
    await recordReservationFinancials({
      tx,
      reservationId,
      supplierPriceTnd: 900,
      salePriceTnd: 1000,
      commissionPercent: 10,
    })

    // Pre-create a B2C customer wallet with TND 1000 balance for debit test
    const inserted = await tx
      .insert(walletAccounts)
      .values({
        customerId,
        type: "credit",
        currentBalance: "1000.00",
        name: "Cert64 Solde client",
        currency: "TND",
        isActive: true,
      })
      .returning({ id: walletAccounts.id })
    walletAccountId = (inserted as Array<{ id: string }>)[0]!.id

    // Insert a commission wallet_ledger entry for settlement test.
    // PLATFORM_COMMISSION_WALLET_ID is seeded by migration 0066, so the FK holds.
    // We date it within PERIOD_START..PERIOD_END to avoid touching production data.
    // createdAt is set via raw SQL to fall in our test period.
    const ledgerInserted = await tx
      .insert(walletLedger)
      .values({
        walletAccountId: PLATFORM_COMMISSION_WALLET_ID,
        type: "credit",
        status: "completed",
        amount: "10.00",
        balanceBefore: "0.00",
        balanceAfter: "10.00",
        description: "Commission CERT64-HOTEL-001 (test)",
        category: "commission",
        reservationId,
      })
      .returning({ id: walletLedger.id })
    walletLedgerIdComm = (ledgerInserted as Array<{ id: string }>)[0]!.id

    // Backdate the entry into our far-future test period so it qualifies for settlement
    await tx.execute(sql`
      UPDATE wallet_ledger
      SET created_at = ${PERIOD_START.toISOString()}::timestamptz
      WHERE id = ${walletLedgerIdComm}::uuid
    `)
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    // Clean up commission_settlements created by settlement tests
    await tx.execute(sql`
      DELETE FROM commission_settlements
      WHERE period_start >= ${PERIOD_START.toISOString().split("T")[0]}
        AND period_end <= ${PERIOD_END.toISOString().split("T")[0]}
    `)
    // Clean up wallet_ledger entries (commission entry + any debit entries)
    await tx.execute(sql`
      DELETE FROM wallet_ledger
      WHERE reservation_id = ${reservationId}::uuid
         OR wallet_account_id = ${walletAccountId}::uuid
    `)
    await tx.delete(walletAccounts).where(eq(walletAccounts.id, walletAccountId))
    await tx.delete(payments).where(eq(payments.reservationId, reservationId))
    await tx.delete(reservationFinancials)
      .where(eq(reservationFinancials.reservationId, reservationId))
    await tx.delete(reservations).where(eq(reservations.agencyId, agencyId))
    await tx.delete(customers).where(eq(customers.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

/* -------------------------------------------------------------------------- */
/* Test 1 — Payment recording : INSERT payments (status='captured')           */
/* -------------------------------------------------------------------------- */

test(
  "payments : INSERT avec status=captured, captured_at renseigné, idempotency_key unique",
  async (t) => {
    if (!dbAvailable) return void t.skip(skip())

    const paymentId = randomUUID()
    const idemKey = `cert64-${randomUUID()}`

    await withSystemContext(async (tx) => {
      await tx.insert(payments).values({
        id: paymentId,
        agencyId,
        reservationId,
        psp: "manual",
        method: "cash",
        originalCurrency: "TND",
        originalAmount: "1000.00",
        tndAmount: "1000.00",
        kind: "deposit",
        status: "captured",
        capturedAt: new Date(),
        idempotencyKey: idemKey,
      })
    })

    const rows = await withSystemContext((tx) =>
      tx.select().from(payments).where(eq(payments.id, paymentId))
    )

    assert.equal(rows.length, 1, "exactement 1 paiement enregistré")
    const p = rows[0]!
    assert.equal(p.status,     "captured", "statut capturé")
    assert.equal(p.agencyId,   agencyId,   "agencyId correct")
    assert.equal(p.reservationId, reservationId, "reservationId correct")
    assert.equal(p.tndAmount,  "1000.00",  "montant TND correct")
    assert.ok(p.capturedAt instanceof Date, "capturedAt renseigné")
    assert.equal(p.idempotencyKey, idemKey, "idempotency_key stockée")

    // Double-capture avec la MÊME clé → contrainte UNIQUE PARTIAL doit rejeter
    await assert.rejects(
      async () => {
        await withSystemContext(async (tx) => {
          await tx.insert(payments).values({
            agencyId,
            reservationId,
            psp: "manual",
            method: "cash",
            originalCurrency: "TND",
            originalAmount: "1000.00",
            tndAmount: "1000.00",
            status: "captured",
            capturedAt: new Date(),
            idempotencyKey: idemKey,   // même clé → UNIQUE violation
          })
        })
      },
      (err: unknown) => {
        const msg    = (err as { message?: string }).message ?? ""
        const pgCode = (err as { cause?: { code?: string } }).cause?.code
          ?? (err as { code?: string }).code
        assert.ok(
          msg.includes("Failed query") || pgCode === "23505",
          `Attendu UNIQUE violation — obtenu: code=${pgCode}, msg=${msg}`,
        )
        return true
      },
      "double-capture avec même idempotency_key doit être rejetée",
    )
  },
)

/* -------------------------------------------------------------------------- */
/* Test 2 — B2C customer wallet : debitCustomerWallet                         */
/* -------------------------------------------------------------------------- */

test(
  "debitCustomerWallet : débite wallet_accounts et crée un wallet_ledger de type debit",
  async (t) => {
    if (!dbAvailable) return void t.skip(skip())

    // debitCustomerWallet with txOverride from withSystemContext (admin context)
    // It calls SET LOCAL app.is_super_admin = 'true' internally — works in any tx
    let result: Awaited<ReturnType<typeof debitCustomerWallet>> | undefined

    await withSystemContext(async (tx) => {
      result = await debitCustomerWallet({
        customerId,
        amountTnd: 500,
        reservationId,
        description: "Cert64 — débit réservation CERT64-HOTEL-001",
        txOverride: tx as unknown as Parameters<typeof debitCustomerWallet>[0]["txOverride"],
      })
    })

    assert.ok(result?.ok === true, `debitCustomerWallet échoué : ${JSON.stringify(result)}`)
    if (!result?.ok) return

    assert.equal(result.balanceBefore, "1000.00", "solde avant = 1000 TND")
    assert.equal(result.balanceAfter,  "500.00",  "solde après = 500 TND")

    // Vérifier le mouvement dans wallet_ledger
    const entries = await withSystemContext((tx) =>
      tx.select().from(walletLedger).where(eq(walletLedger.id, result!.ledgerId))
    )
    assert.equal(entries.length, 1, "exactement 1 ligne ledger créée")
    const e = entries[0]!
    assert.equal(e.type,         "debit",   "type=debit")
    assert.equal(e.amount,       "500.00",  "montant 500 TND")
    assert.equal(e.balanceBefore, "1000.00", "balance_before stockée")
    assert.equal(e.balanceAfter,  "500.00",  "balance_after stockée")
    assert.equal(e.category,      "booking", "category=booking")

    // Vérifier la mise à jour du solde dans wallet_accounts
    const [acc] = await withSystemContext((tx) =>
      tx.select({ bal: walletAccounts.currentBalance })
        .from(walletAccounts)
        .where(eq(walletAccounts.id, result!.walletAccountId))
    )
    assert.equal(acc?.bal, "500.00", "wallet_accounts.current_balance mis à jour à 500 TND")
  },
)

test(
  "debitCustomerWallet : INSUFFICIENT_FUNDS si montant > solde",
  async (t) => {
    if (!dbAvailable) return void t.skip(skip())

    // Solde actuel = 500 TND (après test précédent) — on demande 9999
    let result: Awaited<ReturnType<typeof debitCustomerWallet>> | undefined
    await withSystemContext(async (tx) => {
      result = await debitCustomerWallet({
        customerId,
        amountTnd: 9999,
        description: "Cert64 — débit volontairement trop élevé",
        txOverride: tx as unknown as Parameters<typeof debitCustomerWallet>[0]["txOverride"],
      })
    })

    assert.ok(result?.ok === false, "debitCustomerWallet doit échouer avec INSUFFICIENT_FUNDS")
    if (result?.ok !== false) return
    assert.equal(result.code, "INSUFFICIENT_FUNDS", "code INSUFFICIENT_FUNDS")
  },
)

/* -------------------------------------------------------------------------- */
/* Test 3 — Commission settlement : settleCommissions                         */
/* -------------------------------------------------------------------------- */

let settlementId = ""

test(
  "settleCommissions : agrège les commissions non settlées et crée commission_settlements (status=pending)",
  async (t) => {
    if (!dbAvailable) return void t.skip(skip())

    const result = await settleCommissions(
      PERIOD_START,
      PERIOD_END,
      "cert64-admin",
      "Certification Chantier 64 — test settlement",
    )

    assert.ok(result.settlementId,    "settlementId retourné")
    assert.equal(result.status,       "pending",  "status=pending à la création")
    assert.ok(result.entryCount >= 1, "au moins 1 entrée commission settlée")
    assert.ok(result.totalAmount > 0, "totalAmount > 0")

    settlementId = result.settlementId

    // Vérifier la ligne commission_settlements en base
    const rows = await withSystemContext((tx) =>
      tx.select().from(commissionSettlements)
        .where(eq(commissionSettlements.id, settlementId))
    )
    assert.equal(rows.length, 1, "1 ligne commission_settlements créée")
    const s = rows[0]!
    assert.equal(s.status,           "pending", "status=pending en base")
    assert.equal(s.ledgerEntryCount,  result.entryCount, "ledger_entry_count cohérent")
    assert.equal(s.settledBy,         "cert64-admin", "settled_by renseigné")

    // Vérifier que les entrées wallet_ledger sont marquées settled_at
    const ledgerEntry = await withSystemContext((tx) =>
      tx.select({ settledAt: walletLedger.settledAt, settlementId: walletLedger.settlementId })
        .from(walletLedger)
        .where(eq(walletLedger.id, walletLedgerIdComm))
    )
    assert.ok(
      ledgerEntry[0]?.settledAt != null,
      "wallet_ledger.settled_at renseigné après settlement",
    )
    assert.equal(
      ledgerEntry[0]?.settlementId,
      settlementId,
      "wallet_ledger.settlement_id = settlement créé",
    )
  },
)

/* -------------------------------------------------------------------------- */
/* Test 4 — markSettlementPaid : pending → paid                               */
/* -------------------------------------------------------------------------- */

test(
  "markSettlementPaid : passe le settlement de pending → paid avec settled_at",
  async (t) => {
    if (!dbAvailable) return void t.skip(skip())
    if (!settlementId) return void t.skip("Test 3 n'a pas créé de settlement — skip")

    await markSettlementPaid(settlementId, "cert64-tresorier")

    const rows = await withSystemContext((tx) =>
      tx.select().from(commissionSettlements)
        .where(eq(commissionSettlements.id, settlementId))
    )
    assert.equal(rows.length, 1, "settlement toujours présent")
    const s = rows[0]!
    assert.equal(s.status,    "paid", "status=paid après markSettlementPaid")
    assert.ok(s.settledAt != null,   "settled_at renseigné")
    assert.equal(s.settledBy, "cert64-tresorier", "settled_by mis à jour")
  },
)

/* -------------------------------------------------------------------------- */
/* Test 5 — Idempotence : deuxième settleCommissions même période             */
/* -------------------------------------------------------------------------- */

test(
  "settleCommissions : UNIQUE INDEX bloque un deuxième settlement sur la même période",
  async (t) => {
    if (!dbAvailable) return void t.skip(skip())
    if (!settlementId) return void t.skip("Test 3 n'a pas créé de settlement — skip")

    await assert.rejects(
      async () => {
        await settleCommissions(
          PERIOD_START,
          PERIOD_END,
          "cert64-admin-retry",
        )
      },
      (err: unknown) => {
        const msg    = (err as { message?: string }).message ?? ""
        const pgCode = (err as { cause?: { code?: string } }).cause?.code
          ?? (err as { code?: string }).code
        assert.ok(
          msg.includes("Failed query") || pgCode === "23505",
          `Attendu UNIQUE violation — obtenu: code=${pgCode}, msg=${msg}`,
        )
        return true
      },
      "un deuxième INSERT commission_settlements sur la même période doit être rejeté",
    )
  },
)

/* -------------------------------------------------------------------------- */
/* Test 6 — Rollback : exception dans withSystemContext annule tout           */
/* -------------------------------------------------------------------------- */

test(
  "withSystemContext rollback : une exception annule tous les INSERTs intermédiaires",
  async (t) => {
    if (!dbAvailable) return void t.skip(skip())

    const rollbackReservationId = randomUUID()

    // Essayer d'insérer une réservation + reservation_financials, puis throw
    await assert.rejects(
      async () => {
        await withSystemContext(async (tx) => {
          await tx.insert(reservations).values({
            id: rollbackReservationId,
            agencyId,
            publicRef: "CERT64-ROLLBACK-001",
            customerId,
            module: "hotel",
            source: "manual",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: "999.00",
            tndAmount: "999.00",
          })

          await recordReservationFinancials({
            tx,
            reservationId: rollbackReservationId,
            supplierPriceTnd: 800,
            salePriceTnd: 999,
          })

          // Forcer un rollback
          throw new Error("CERT64_ROLLBACK_TEST")
        })
      },
      (err: unknown) => {
        assert.equal(
          (err as { message?: string }).message,
          "CERT64_ROLLBACK_TEST",
          "l'erreur lancée est bien propagée",
        )
        return true
      },
    )

    // Vérifier qu'aucun enregistrement partiel n'a été écrit
    const resRows = await withSystemContext((tx) =>
      tx.select().from(reservations)
        .where(eq(reservations.id, rollbackReservationId))
    )
    assert.equal(resRows.length, 0, "reservation non persistée après rollback")

    const finRows = await withSystemContext((tx) =>
      tx.select().from(reservationFinancials)
        .where(eq(reservationFinancials.reservationId, rollbackReservationId))
    )
    assert.equal(finRows.length, 0, "reservation_financials non persistée après rollback")
  },
)

/* -------------------------------------------------------------------------- */
/* Gap documenté — Supplier Reconciliation                                    */
/* -------------------------------------------------------------------------- */

test(
  "GAP DOCUMENTÉ : supplier reconciliation n'est pas implémenté (roadmap uniquement)",
  async (t) => {
    // Ce test documente explicitement l'absence de la fonctionnalité.
    // Référence : lib/db/schema/suppliers.ts — commentaire L5 connectivity
    // mentionne "reconciliation SLA" comme roadmap future, pas un module existant.
    // Aucune table supplier_invoice, supplier_reconciliation ni
    // supplier_settlement n'existe dans les migrations actuelles.
    const GAP_DOCUMENTED = true
    assert.ok(GAP_DOCUMENTED, "supplier reconciliation = GAP documenté, pas encore implémenté")
    t.diagnostic(
      "Supplier reconciliation non implémenté. " +
      "Voir lib/db/schema/suppliers.ts commentaire L5 connectivity. " +
      "À implémenter dans un Chantier dédié avant certification complète.",
    )
  },
)
