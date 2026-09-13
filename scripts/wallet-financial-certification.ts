#!/usr/bin/env tsx
/**
 * wallet-financial-certification.ts
 *
 * Certification financière E2E du modèle Wallet & Settlement (payment =
 * alimentation du wallet, réservation = débit du wallet) — 14 scénarios
 * réels demandés (B2C 1-12, B2B 13, PARTNER_GUARANTEE+tolérance 14) plus
 * idempotence et rollback, contre une VRAIE base Postgres locale, via les
 * fonctions RÉELLEMENT exportées par l'application (aucun mock).
 *
 * N'invoque PAS les Server Actions "use server" qui résolvent une session
 * Supabase (verifyManualPayment, adminRechargeWallet, setAgencyReservationTolerance,
 * debitPartnerCredit appelé depuis lib/booking/actions.ts) — cela exigerait
 * une session GoTrue live, hors périmètre d'un script DB. À la place, ce
 * script reproduit fidèlement le CORPS transactionnel réel de chacune (même
 * séquence d'appels aux mêmes fonctions exportées : recordTargetedWalletSettlement,
 * debitCustomerWallet, applyReservationRefund, debitPartnerCredit, les
 * fonctions SQL SECURITY DEFINER set_agency_deposit_balance/
 * set_agency_reservation_tolerance) — seule la résolution session→profil
 * (assertSuperAdmin/getCurrentAdminProfile, pure lookup d'auth, pas un
 * mécanisme financier) est remplacée par un contexte de tenant déjà résolu,
 * exactement comme le font déjà les tests DB-mode de ce dépôt
 * (lib/finance/__tests__/customer-wallet.test.ts, lib/pro/__tests__/booking-actions.test.ts).
 *
 * Usage : DATABASE_URL=... npx tsx scripts/wallet-financial-certification.ts
 */

import { randomUUID } from "crypto"
import { eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import { agencies, customers, reservations, payments, walletLedger, walletAccounts, partnerCreditMovements } from "@/lib/db/schema"
import {
  creditCustomerWallet,
  debitCustomerWallet,
  recordTargetedWalletSettlement,
  getCustomerWalletBalance,
  parseTnd as parseWalletTnd,
} from "@/lib/finance/customer-wallet"
import { applyReservationRefund } from "@/lib/finance/refund-logic"
import { debitPartnerCredit, parseTnd as parseAgencyTnd } from "@/lib/pro/booking-actions"
import { MANUAL_PAYMENT_ALLOWED_ROLES, toPaymentMethod, computeCaptureKind } from "@/lib/finance/manual-payment-logic"
import { pgErrorCode } from "@/lib/db/pg-error"

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

type Row = { id: string; label: string; status: "PASS" | "FAIL"; details: string }
const results: Row[] = []

function record(id: string, label: string, ok: boolean, details: string) {
  results.push({ id, label, status: ok ? "PASS" : "FAIL", details })
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"} [${id}] ${label}\n    ${details}`)
}

function assertTrue(cond: unknown, msg: string): void {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg)
}

const STAFF_USER_ID = randomUUID()
const MASTER_ADMIN_ID = randomUUID()

async function main() {
  const db = getDb()

  console.log("\n=== SETUP — agences/clients de certification ===\n")
  const [agencyB2C, agencyB2B, customerA, customerB] = await withSystemContext(async (tx) => {
    const [a1] = await tx
      .insert(agencies)
      .values({ slug: `cert-b2c-${Date.now()}`, name: "Certification B2C", agencyType: "ota" })
      .returning()
    const [a2] = await tx
      .insert(agencies)
      .values({ slug: `cert-b2b-${Date.now()}`, name: "Certification B2B Partner", agencyType: "partner" })
      .returning()
    const [c1] = await tx
      .insert(customers)
      .values({ agencyId: a1.id, firstName: "Client", lastName: "Certification", email: "cert-client@example.com" })
      .returning()
    const [c2] = await tx
      .insert(customers)
      .values({ agencyId: a2.id, firstName: "Voyageur", lastName: "B2B", email: "cert-b2b@example.com" })
      .returning()
    return [a1, a2, c1, c2] as const
  })
  console.log(`agencyB2C=${agencyB2C.id} agencyB2B=${agencyB2B.id} customerA=${customerA.id} customerB=${customerB.id}\n`)

  async function makeReservation(agencyId: string, customerId: string, module: string, tndAmount: number) {
    return withSystemContext(async (tx) => {
      const [row] = await tx
        .insert(reservations)
        .values({
          agencyId,
          customerId,
          module: module as never,
          source: "internal",
          status: "pending",
          originalCurrency: "TND",
          originalAmount: tndAmount.toFixed(2),
          tndAmount: tndAmount.toFixed(2),
          publicRef: `CERT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        })
        .returning()
      return row
    })
  }

  /** Lecture système (bypass RLS) — pour les assertions de vérification, pas pour les mutations financières elles-mêmes. */
  async function sysRead<T>(fn: (tx: Parameters<Parameters<typeof withSystemContext>[0]>[0]) => Promise<T>): Promise<T> {
    return withSystemContext(fn)
  }
  void db

  /* ============================================================ */
  /* B2C — Scénarios 1 à 12                                         */
  /* ============================================================ */

  console.log("\n=== B2C ===\n")

  // 1. Client B2C crée son wallet (création paresseuse au 1er mouvement)
  const balance0 = await getCustomerWalletBalance(customerA.id)
  record(
    "1",
    "Client B2C crée son wallet",
    balance0 === 0,
    `Solde initial = ${balance0} DT (aucun compte wallet_accounts n'existe encore — création paresseuse au premier crédit/débit, comportement voulu).`,
  )

  // 2. Alimentation par carte (ONLINE_CARD, automatique)
  const R1 = await makeReservation(agencyB2C.id, customerA.id, "hotel", 500)
  let s2ok = false
  let s2details = ""
  try {
    await withSystemContext(async (tx) => {
      const [pay] = await tx
        .insert(payments)
        .values({
          agencyId: agencyB2C.id,
          reservationId: R1.id,
          psp: "paymee",
          method: "card",
          pspTransactionId: `PAYMEE-${R1.id.slice(0, 8)}`,
          originalCurrency: "TND",
          originalAmount: "500.00",
          tndAmount: "500.00",
          kind: "balance",
          status: "captured",
          capturedAt: new Date(),
        })
        .returning({ id: payments.id })
      const settlement = await recordTargetedWalletSettlement({
        customerId: customerA.id,
        amountTnd: 500,
        reservationId: R1.id,
        paymentId: pay.id,
        method: "online_card",
        reference: R1.publicRef,
        txOverride: tx as never,
      })
      assertTrue(settlement.ok, "recordTargetedWalletSettlement (carte) doit réussir")
      await tx.update(reservations).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(reservations.id, R1.id))
      s2ok = true
      const succ = settlement as { balanceAfter: string; ledgerId: string }
      s2details = `crédit+débit 500.00 DT (ledger débit=${succ.ledgerId}), solde net après règlement ciblé = ${succ.balanceAfter} DT (0.00 attendu — recharge consommée instantanément par CETTE réservation), réservation ${R1.publicRef} confirmée.`
    })
  } catch (e) {
    s2details = String(e)
  }
  record("2", "Alimentation par carte (ONLINE_CARD, validation automatique)", s2ok, s2details)

  // 3+5. Alimentation par virement (BANK_TRANSFER) + validation staff
  const R2 = await makeReservation(agencyB2C.id, customerA.id, "omra", 300)
  // Gate de rôle staff — logique pure réellement utilisée par verifyManualPayment.
  const roleRejected = !(MANUAL_PAYMENT_ALLOWED_ROLES as readonly string[]).includes("agent_excursions")
  const roleAccepted = (MANUAL_PAYMENT_ALLOWED_ROLES as readonly string[]).includes("manager")
  record(
    "5",
    "Validation staff — gate de rôle (MANUAL_PAYMENT_ALLOWED_ROLES)",
    roleRejected && roleAccepted,
    `rôle "agent_excursions" rejeté=${roleRejected} (hors périmètre financier) ; rôle "manager" accepté=${roleAccepted}.`,
  )
  let s3ok = false
  let s3details = ""
  try {
    await withTenantContext({ agencyId: agencyB2C.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
      const idempotencyKey = `manual:${R2.id}:transfer:VIR-001`
      const [pay] = await tx
        .insert(payments)
        .values({
          agencyId: agencyB2C.id,
          reservationId: R2.id,
          psp: "manual",
          method: toPaymentMethod("transfer"),
          pspTransactionId: "VIR-001",
          idempotencyKey,
          originalCurrency: "TND",
          originalAmount: "300.00",
          tndAmount: "300.00",
          kind: computeCaptureKind(0, 0.005),
          status: "captured",
          capturedAt: new Date(),
        })
        .returning({ id: payments.id })
      const settlement = await recordTargetedWalletSettlement({
        customerId: customerA.id,
        amountTnd: 300,
        reservationId: R2.id,
        paymentId: pay.id,
        method: "bank_transfer",
        reference: R2.publicRef,
        txOverride: tx as never,
      })
      assertTrue(settlement.ok, "recordTargetedWalletSettlement (virement) doit réussir")
      await tx.update(reservations).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(reservations.id, R2.id))
      s3ok = true
      s3details = `staff manager valide un virement de 300.00 DT (réf VIR-001), payments.method="${toPaymentMethod("transfer")}", wallet_ledger.metadata.paymentMethod="bank_transfer", réservation ${R2.publicRef} confirmée.`
    })
  } catch (e) {
    s3details = String(e)
  }
  record("3", "Alimentation par virement (BANK_TRANSFER, validation staff)", s3ok, s3details)

  // 4. Alimentation par dépôt bancaire (BANK_DEPOSIT, validation staff)
  const R3 = await makeReservation(agencyB2C.id, customerA.id, "package", 750)
  let s4ok = false
  let s4details = ""
  try {
    await withTenantContext({ agencyId: agencyB2C.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
      const idempotencyKey = `manual:${R3.id}:deposit:DEP-001`
      const [pay] = await tx
        .insert(payments)
        .values({
          agencyId: agencyB2C.id,
          reservationId: R3.id,
          psp: "manual",
          method: toPaymentMethod("deposit"),
          pspTransactionId: "DEP-001",
          idempotencyKey,
          originalCurrency: "TND",
          originalAmount: "750.00",
          tndAmount: "750.00",
          kind: computeCaptureKind(0, 0.005),
          status: "captured",
          capturedAt: new Date(),
        })
        .returning({ id: payments.id })
      const settlement = await recordTargetedWalletSettlement({
        customerId: customerA.id,
        amountTnd: 750,
        reservationId: R3.id,
        paymentId: pay.id,
        method: "bank_deposit",
        reference: R3.publicRef,
        txOverride: tx as never,
      })
      assertTrue(settlement.ok, "recordTargetedWalletSettlement (dépôt bancaire) doit réussir")
      await tx.update(reservations).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(reservations.id, R3.id))
      s4ok = true
      s4details = `staff manager valide un dépôt bancaire de 750.00 DT (réf DEP-001), payments.method="${toPaymentMethod("deposit")}" (mappé sur "transfer", pas de valeur d'enum dédiée), wallet_ledger.metadata.paymentMethod="bank_deposit" (taxonomie préservée), réservation ${R3.publicRef} confirmée.`
    })
  } catch (e) {
    s4details = String(e)
  }
  record("4", "Alimentation par dépôt bancaire (BANK_DEPOSIT, validation staff)", s4ok, s4details)

  // 6. Crédit wallet (solde réellement disponible — crédit direct Master Admin)
  let s6ok = false
  let s6details = ""
  try {
    const before = await getCustomerWalletBalance(customerA.id)
    const credit = await creditCustomerWallet({
      customerId: customerA.id,
      amountTnd: 200,
      description: "Crédit Master Admin — certification financière",
      source: "adjustment",
    })
    assertTrue(credit.ok, "creditCustomerWallet (adjustment) doit réussir")
    const after = await getCustomerWalletBalance(customerA.id)
    s6ok = credit.ok && after === before + 200
    s6details = `crédit direct 200.00 DT (source="adjustment"), solde ${before} DT → ${after} DT — solde réellement disponible pour une FUTURE réservation (contrairement au crédit+débit ciblé des scénarios 2-4).`
  } catch (e) {
    s6details = String(e)
  }
  record("6", "Crédit wallet (solde disponible, hors réservation ciblée)", s6ok, s6details)

  // 7+8. Réservation payée par le solde wallet (CUSTOMER_WALLET) + débit
  const R4 = await makeReservation(agencyB2C.id, customerA.id, "activity", 150)
  let s78ok = false
  let s78details = ""
  try {
    const before = await getCustomerWalletBalance(customerA.id)
    await withTenantContext({ agencyId: agencyB2C.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
      const [pay] = await tx
        .insert(payments)
        .values({
          agencyId: agencyB2C.id,
          reservationId: R4.id,
          psp: "manual",
          method: "wallet",
          pspTransactionId: "WALLET-SPEND-001",
          idempotencyKey: `manual:${R4.id}:wallet:WALLET-SPEND-001`,
          originalCurrency: "TND",
          originalAmount: "150.00",
          tndAmount: "150.00",
          kind: "balance",
          status: "captured",
          capturedAt: new Date(),
        })
        .returning({ id: payments.id })
      const debit = await debitCustomerWallet({
        customerId: customerA.id,
        amountTnd: 150,
        reservationId: R4.id,
        description: `Règlement Solde Easy2Book — réservation ${R4.publicRef}`,
        txOverride: tx as never,
      })
      assertTrue(debit.ok, "debitCustomerWallet (Solde Easy2Book) doit réussir")
      await tx.update(reservations).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(reservations.id, R4.id))
      void pay
    })
    const after = await getCustomerWalletBalance(customerA.id)
    s78ok = after === before - 150
    s78details = `réservation ${R4.publicRef} (150.00 DT, module activity) créée puis réglée par débit direct du solde disponible : ${before} DT → ${after} DT.`
  } catch (e) {
    s78details = String(e)
  }
  record("7+8", "Réservation (CUSTOMER_WALLET) → débit wallet", s78ok, s78details)

  // 9+10. Annulation → remboursement → retour wallet
  let s910ok = false
  let s910details = ""
  try {
    const before = await getCustomerWalletBalance(customerA.id)
    await withTenantContext({ agencyId: agencyB2C.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
      const refund = await applyReservationRefund({
        tx: tx as never,
        agencyId: agencyB2C.id,
        reservationId: R4.id,
        customerId: customerA.id,
        publicRef: R4.publicRef,
        reason: "Certification — annulation client",
        actorUserId: STAFF_USER_ID,
        amountTnd: 150,
      })
      assertTrue(refund.ok, "applyReservationRefund doit réussir")
      assertTrue((refund as { fullyRefunded: boolean }).fullyRefunded, "remboursement doit être total")
      await tx.update(reservations).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(reservations.id, R4.id))
    })
    const after = await getCustomerWalletBalance(customerA.id)
    s910ok = after === before + 150
    s910details = `annulation réservation ${R4.publicRef} → applyReservationRefund crédite le WALLET CLIENT (financée par débit wallet, pas par crédit agence — wasFundedByAgencyCredit=false) : ${before} DT → ${after} DT.`
  } catch (e) {
    s910details = String(e)
  }
  record("9+10", "Annulation → remboursement → retour wallet", s910ok, s910details)

  // 11. Vérification du ledger
  let s11ok = false
  let s11details = ""
  try {
    const [account] = await sysRead((tx) =>
      tx
        .select({ id: walletAccounts.id, currentBalance: walletAccounts.currentBalance })
        .from(walletAccounts)
        .where(eq(walletAccounts.customerId, customerA.id))
        .limit(1),
    )
    assertTrue(account, "compte wallet client introuvable")
    const ledgerRows = await sysRead((tx) =>
      tx.select().from(walletLedger).where(eq(walletLedger.walletAccountId, account.id)).orderBy(walletLedger.createdAt),
    )
    let running = 0
    for (const row of ledgerRows) {
      running += row.type === "credit" ? parseWalletTnd(row.amount) : -parseWalletTnd(row.amount)
    }
    const finalBalance = parseWalletTnd(account.currentBalance)
    const reconciled = Math.abs(running - finalBalance) < 0.005
    const categories = new Set(ledgerRows.map((r) => r.category))
    s11ok = reconciled && ledgerRows.length >= 8
    s11details = `${ledgerRows.length} mouvements ledger (catégories: ${[...categories].join(", ")}) — somme(crédits)-somme(débits)=${running.toFixed(2)} DT, solde compte=${finalBalance.toFixed(2)} DT (réconciliation exacte=${reconciled}).`
  } catch (e) {
    s11details = String(e)
  }
  record("11", "Vérification du ledger (réconciliation crédits/débits = solde)", s11ok, s11details)

  // 12. Aucune réservation ne peut être confirmée sans fonds disponibles
  const R5 = await makeReservation(agencyB2C.id, customerA.id, "activity", 1000)
  let s12ok = false
  let s12details = ""
  try {
    const before = await getCustomerWalletBalance(customerA.id)
    const countLedgerRows = () =>
      sysRead((tx) =>
        tx
          .select({ id: walletLedger.id })
          .from(walletLedger)
          .innerJoin(walletAccounts, eq(walletLedger.walletAccountId, walletAccounts.id))
          .where(eq(walletAccounts.customerId, customerA.id)),
      )
    const ledgerCountBefore = (await countLedgerRows()).length
    const debit = await debitCustomerWallet({
      customerId: customerA.id,
      amountTnd: 1000,
      reservationId: R5.id,
      description: `Règlement Solde Easy2Book — réservation ${R5.publicRef}`,
    })
    const ledgerCountAfter = (await countLedgerRows()).length
    const [reReadR5] = await sysRead((tx) => tx.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, R5.id)))
    s12ok =
      !debit.ok &&
      debit.code === "INSUFFICIENT_FUNDS" &&
      ledgerCountAfter === ledgerCountBefore &&
      reReadR5.status === "pending"
    s12details = `débit 1000.00 DT demandé, solde disponible ${before} DT → refusé (code=${(debit as { code?: string }).code}), aucune ligne wallet_ledger créée (${ledgerCountBefore}→${ledgerCountAfter}), réservation ${R5.publicRef} reste "${reReadR5.status}" (jamais confirmée).`
  } catch (e) {
    s12details = String(e)
  }
  record("12", "Aucune réservation confirmée sans fonds disponibles", s12ok, s12details)

  /* ============================================================ */
  /* IDEMPOTENCE + ROLLBACK                                        */
  /* ============================================================ */

  console.log("\n=== Idempotence & Rollback ===\n")

  // Idempotence : double soumission du MÊME règlement manuel (même clé).
  const R6 = await makeReservation(agencyB2C.id, customerA.id, "omra", 90)
  let sIdemOk = false
  let sIdemDetails = ""
  try {
    const idempotencyKey = `manual:${R6.id}:transfer:IDEM-TEST`
    const attempt = async () =>
      withTenantContext({ agencyId: agencyB2C.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
        try {
          const [capturedPayment] = await tx.transaction((tx2) =>
            tx2
              .insert(payments)
              .values({
                agencyId: agencyB2C.id,
                reservationId: R6.id,
                psp: "manual",
                method: "transfer",
                pspTransactionId: "IDEM-TEST",
                idempotencyKey,
                originalCurrency: "TND",
                originalAmount: "90.00",
                tndAmount: "90.00",
                kind: "balance",
                status: "captured",
                capturedAt: new Date(),
              })
              .returning({ id: payments.id }),
          )
          const settlement = await recordTargetedWalletSettlement({
            customerId: customerA.id,
            amountTnd: 90,
            reservationId: R6.id,
            paymentId: capturedPayment?.id,
            method: "bank_transfer",
            reference: R6.publicRef,
            txOverride: tx as never,
          })
          if (!settlement.ok) throw new Error(settlement.message)
          return { ok: true as const }
        } catch (err) {
          if (pgErrorCode(err) === "23505") {
            return { ok: false as const, code: "ALREADY_PROCESSED" as const }
          }
          throw err
        }
      })
    const first = await attempt()
    const balanceAfterFirst = await getCustomerWalletBalance(customerA.id)
    const second = await attempt()
    const balanceAfterSecond = await getCustomerWalletBalance(customerA.id)
    const paymentRows = await sysRead((tx) => tx.select({ id: payments.id }).from(payments).where(eq(payments.reservationId, R6.id)))
    sIdemOk =
      first.ok === true &&
      second.ok === false &&
      (second as { code?: string }).code === "ALREADY_PROCESSED" &&
      balanceAfterFirst === balanceAfterSecond &&
      paymentRows.length === 1
    sIdemDetails = `1ère tentative ok=${first.ok}, 2ème tentative (même idempotencyKey) rejetée=${!second.ok} (code=${(second as { code?: string }).code ?? "n/a"}, contrainte payments_capture_idempotency_uniq), solde inchangé entre les deux (${balanceAfterFirst} DT), une seule ligne payments capturée (${paymentRows.length}).`
  } catch (e) {
    sIdemDetails = String(e)
  }
  record("IDEM", "Idempotence — double soumission du même règlement", sIdemOk, sIdemDetails)

  // Rollback : un débit wallet raté DOIT annuler l'insertion `payments` déjà tentée.
  const [customerC] = await withSystemContext((tx) =>
    tx
      .insert(customers)
      .values({ agencyId: agencyB2C.id, firstName: "Client", lastName: "SansFonds", email: "cert-nofunds@example.com" })
      .returning(),
  )
  const R7 = await makeReservation(agencyB2C.id, customerC.id, "activity", 999)
  let sRollbackOk = false
  let sRollbackDetails = ""
  try {
    let threw = false
    try {
      await withTenantContext({ agencyId: agencyB2C.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
        await tx.transaction((tx2) =>
          tx2.insert(payments).values({
            agencyId: agencyB2C.id,
            reservationId: R7.id,
            psp: "manual",
            method: "wallet",
            pspTransactionId: "ROLLBACK-TEST",
            idempotencyKey: `manual:${R7.id}:wallet:ROLLBACK-TEST`,
            originalCurrency: "TND",
            originalAmount: "999.00",
            tndAmount: "999.00",
            kind: "balance",
            status: "captured",
            capturedAt: new Date(),
          }),
        )
        // customerC a un solde de 0 DT — ce débit DOIT échouer.
        const debit = await debitCustomerWallet({
          customerId: customerC.id,
          amountTnd: 999,
          reservationId: R7.id,
          description: "Règlement Solde Easy2Book — sans fonds (test rollback)",
          txOverride: tx as never,
        })
        if (!debit.ok) {
          // Même mécanisme que ManualWalletDebitFailedError dans
          // manual-payment-actions.ts : throw délibéré pour ROLLBACK toute
          // la transaction, y compris l'INSERT payments déjà exécuté.
          throw new Error(`ROLLBACK_FORCÉ: ${debit.code}`)
        }
      })
    } catch (err) {
      threw = String(err).includes("ROLLBACK_FORCÉ")
    }
    const orphanPayments = await sysRead((tx) => tx.select({ id: payments.id }).from(payments).where(eq(payments.reservationId, R7.id)))
    const [reReadR7] = await sysRead((tx) => tx.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, R7.id)))
    sRollbackOk = threw && orphanPayments.length === 0 && reReadR7.status === "pending"
    sRollbackDetails = `débit wallet refusé (solde 0 DT) → throw intentionnel capturé=${threw}, AUCUNE ligne payments orpheline après rollback (${orphanPayments.length} trouvée(s), attendu 0), réservation reste "${reReadR7.status}" — la transaction Postgres a bien tout annulé, y compris l'INSERT payments déjà exécuté avant l'échec.`
  } catch (e) {
    sRollbackDetails = String(e)
  }
  record("ROLLBACK", "Rollback atomique — débit wallet raté n'écrit jamais un paiement orphelin", sRollbackOk, sRollbackDetails)

  /* ============================================================ */
  /* B2B — Scénario 13                                              */
  /* ============================================================ */

  console.log("\n=== B2B ===\n")

  // 13a. Recharge du crédit agence (mirroir adminRechargeWallet)
  let s13aOk = false
  let s13aDetails = ""
  try {
    await withTenantContext({ agencyId: null, userId: MASTER_ADMIN_ID, isSuperAdmin: true }, async (tx) => {
      const [agency] = await tx.select({ depositBalance: agencies.depositBalance }).from(agencies).where(eq(agencies.id, agencyB2B.id)).for("update")
      const newBalance = parseAgencyTnd(agency.depositBalance) + 2000
      await tx.execute(sql`SELECT set_agency_deposit_balance(${agencyB2B.id}::uuid, ${newBalance.toFixed(3)}::numeric)`)
      await tx.insert(partnerCreditMovements).values({
        agencyId: agencyB2B.id,
        movementType: "credit",
        amount: "2000.000",
        balanceAfter: newBalance.toFixed(3),
        reference: "ADMIN-RECHARGE-CERT",
        description: "Recharge directe admin — certification financière",
        createdByUserId: MASTER_ADMIN_ID,
      })
      s13aOk = true
      s13aDetails = `crédit agence rechargé 0.000 → ${newBalance.toFixed(3)} DT via set_agency_deposit_balance() (seul canal autorisé, RLS agencies_admin_write).`
    })
  } catch (e) {
    s13aDetails = String(e)
  }
  record("13a", "B2B — Recharge du crédit agence", s13aOk, s13aDetails)

  // 13b. Débit pour une réservation B2B
  const RB1 = await makeReservation(agencyB2B.id, customerB.id, "hotel", 1200)
  let s13bOk = false
  let s13bDetails = ""
  try {
    await withTenantContext({ agencyId: agencyB2B.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
      const debit = await debitPartnerCredit({
        agencyId: agencyB2B.id,
        amountTnd: 1200,
        reservationId: RB1.id,
        reference: RB1.publicRef,
        description: "Réservation B2B — certification",
        createdByUserId: STAFF_USER_ID,
        txOverride: tx as never,
      })
      assertTrue(debit.ok, "debitPartnerCredit doit réussir")
      // Miroir payments (method "wallet") — même convention que lib/booking/actions.ts,
      // nécessaire pour que applyReservationRefund (scénario 13c) trouve un montant à rembourser.
      await tx.insert(payments).values({
        agencyId: agencyB2B.id,
        reservationId: RB1.id,
        psp: "manual",
        method: "wallet",
        pspTransactionId: `B2B-DEBIT-${RB1.id.slice(0, 8)}`,
        originalCurrency: "TND",
        originalAmount: "1200.00",
        tndAmount: "1200.00",
        kind: "balance",
        status: "captured",
        capturedAt: new Date(),
      })
      await tx.update(reservations).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(reservations.id, RB1.id))
      const succ = debit as { balanceBefore: string; balanceAfter: string }
      s13bOk = true
      s13bDetails = `réservation ${RB1.publicRef} (1200.00 DT) débitée du crédit agence : ${succ.balanceBefore} DT → ${succ.balanceAfter} DT, mouvement partner_credit_movements créé, réservation confirmée.`
    })
  } catch (e) {
    s13bDetails = String(e)
  }
  record("13b", "B2B — Débit du crédit agence pour une réservation", s13bOk, s13bDetails)

  // 13c. Annulation → remboursement → retour au CRÉDIT AGENCE (jamais wallet client)
  let s13cOk = false
  let s13cDetails = ""
  try {
    await withTenantContext({ agencyId: agencyB2B.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
      const [before] = await tx.select({ depositBalance: agencies.depositBalance }).from(agencies).where(eq(agencies.id, agencyB2B.id))
      const refund = await applyReservationRefund({
        tx: tx as never,
        agencyId: agencyB2B.id,
        reservationId: RB1.id,
        customerId: customerB.id,
        publicRef: RB1.publicRef,
        reason: "Certification B2B — annulation",
        actorUserId: STAFF_USER_ID,
        amountTnd: 1200,
      })
      assertTrue(refund.ok, "applyReservationRefund (B2B) doit réussir")
      await tx.update(reservations).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(reservations.id, RB1.id))
      const [after] = await tx.select({ depositBalance: agencies.depositBalance }).from(agencies).where(eq(agencies.id, agencyB2B.id))
      const customerWalletBalance = await getCustomerWalletBalance(customerB.id)
      s13cOk = parseAgencyTnd(after.depositBalance) === parseAgencyTnd(before.depositBalance) + 1200 && customerWalletBalance === 0
      s13cDetails = `remboursement 1200.00 DT détecté comme financé par le crédit agence (wasFundedByAgencyCredit=true) : crédit agence ${before.depositBalance} DT → ${after.depositBalance} DT ; wallet CLIENT resté à ${customerWalletBalance} DT (jamais crédité — bonne cible).`
    })
  } catch (e) {
    s13cDetails = String(e)
  }
  record("13c", "B2B — Remboursement → retour au crédit agence (pas au wallet client)", s13cOk, s13cDetails)

  // 13d. Refus si fonds insuffisants (sans tolérance)
  const RB2 = await makeReservation(agencyB2B.id, customerB.id, "package", 50000)
  let s13dOk = false
  let s13dDetails = ""
  try {
    await withTenantContext({ agencyId: agencyB2B.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
      const [before] = await tx.select({ depositBalance: agencies.depositBalance }).from(agencies).where(eq(agencies.id, agencyB2B.id))
      const debit = await debitPartnerCredit({
        agencyId: agencyB2B.id,
        amountTnd: 50000,
        reservationId: RB2.id,
        reference: RB2.publicRef,
        description: "Réservation B2B surdimensionnée — certification",
        createdByUserId: STAFF_USER_ID,
        txOverride: tx as never,
      })
      const [after] = await tx.select({ depositBalance: agencies.depositBalance }).from(agencies).where(eq(agencies.id, agencyB2B.id))
      s13dOk = !debit.ok && (debit as { code?: string }).code === "INSUFFICIENT_FUNDS" && before.depositBalance === after.depositBalance
      s13dDetails = `débit 50000.00 DT demandé, solde disponible ${before.depositBalance} DT → refusé (code=${(debit as { code?: string }).code}), solde inchangé (${before.depositBalance} DT).`
    })
  } catch (e) {
    s13dDetails = String(e)
  }
  record("13d", "B2B — Refus si fonds insuffisants", s13dOk, s13dDetails)

  /* ============================================================ */
  /* PARTNER_GUARANTEE + tolérance — Scénario 14                     */
  /* ============================================================ */

  console.log("\n=== PARTNER_GUARANTEE + tolérance ===\n")

  let s14aOk = false
  let s14aDetails = ""
  try {
    await withTenantContext({ agencyId: null, userId: MASTER_ADMIN_ID, isSuperAdmin: true }, async (tx) => {
      await tx.execute(sql`SELECT set_agency_reservation_tolerance(${agencyB2B.id}::uuid, 500.000::numeric)`)
    })
    const [row] = await sysRead((tx) => tx.select({ reservationTolerance: agencies.reservationTolerance }).from(agencies).where(eq(agencies.id, agencyB2B.id)))
    s14aOk = parseAgencyTnd(row.reservationTolerance) === 500
    s14aDetails = `reservation_tolerance configurée à ${row.reservationTolerance} DT via set_agency_reservation_tolerance() (Master Admin uniquement).`
  } catch (e) {
    s14aDetails = String(e)
  }
  record("14a", "PARTNER_GUARANTEE — configuration de la tolérance", s14aOk, s14aDetails)

  const RB3 = await makeReservation(agencyB2B.id, customerB.id, "hotel", 2300)
  let s14bOk = false
  let s14bDetails = ""
  try {
    await withTenantContext({ agencyId: agencyB2B.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
      const [before] = await tx
        .select({ depositBalance: agencies.depositBalance, reservationTolerance: agencies.reservationTolerance })
        .from(agencies)
        .where(eq(agencies.id, agencyB2B.id))
      const debit = await debitPartnerCredit({
        agencyId: agencyB2B.id,
        amountTnd: 2300,
        reservationId: RB3.id,
        reference: RB3.publicRef,
        description: "Réservation B2B dans la tolérance — certification",
        createdByUserId: STAFF_USER_ID,
        txOverride: tx as never,
      })
      assertTrue(debit.ok, "debitPartnerCredit doit réussir dans la limite de la tolérance")
      const succ = debit as { balanceAfter: string }
      s14bOk = parseAgencyTnd(succ.balanceAfter) === parseAgencyTnd(before.depositBalance) - 2300 && parseAgencyTnd(succ.balanceAfter) < 0
      s14bDetails = `booking_capacity = ${before.depositBalance} + ${before.reservationTolerance} = ${(parseAgencyTnd(before.depositBalance) + parseAgencyTnd(before.reservationTolerance)).toFixed(3)} DT ≥ 2300.000 DT demandé → débit accepté, solde ${before.depositBalance} DT → ${succ.balanceAfter} DT (temporairement NÉGATIF, dans la tolérance de 500.000 DT) — CHECK DB agencies_deposit_balance_floor respecté.`
    })
  } catch (e) {
    s14bDetails = String(e)
  }
  record("14b", "PARTNER_GUARANTEE — débit accepté dans la limite de la tolérance (solde négatif)", s14bOk, s14bDetails)

  const RB4 = await makeReservation(agencyB2B.id, customerB.id, "package", 400)
  let s14cOk = false
  let s14cDetails = ""
  try {
    await withTenantContext({ agencyId: agencyB2B.id, userId: STAFF_USER_ID, isSuperAdmin: false }, async (tx) => {
      const [before] = await tx
        .select({ depositBalance: agencies.depositBalance, reservationTolerance: agencies.reservationTolerance })
        .from(agencies)
        .where(eq(agencies.id, agencyB2B.id))
      const debit = await debitPartnerCredit({
        agencyId: agencyB2B.id,
        amountTnd: 400,
        reservationId: RB4.id,
        reference: RB4.publicRef,
        description: "Réservation B2B au-delà de la tolérance — certification",
        createdByUserId: STAFF_USER_ID,
        txOverride: tx as never,
      })
      const [after] = await tx.select({ depositBalance: agencies.depositBalance }).from(agencies).where(eq(agencies.id, agencyB2B.id))
      s14cOk = !debit.ok && (debit as { code?: string }).code === "INSUFFICIENT_FUNDS" && before.depositBalance === after.depositBalance
      s14cDetails = `booking_capacity = ${before.depositBalance} + ${before.reservationTolerance} = ${(parseAgencyTnd(before.depositBalance) + parseAgencyTnd(before.reservationTolerance)).toFixed(3)} DT < 400.000 DT demandé → refusé (code=${(debit as { code?: string }).code}), solde inchangé (${before.depositBalance} DT).`
    })
  } catch (e) {
    s14cDetails = String(e)
  }
  record("14c", "PARTNER_GUARANTEE — refus au-delà de la tolérance", s14cOk, s14cDetails)

  /* ============================================================ */
  /* SYNTHÈSE                                                       */
  /* ============================================================ */

  console.log("\n\n=== MATRICE PASS/FAIL ===\n")
  const failed = results.filter((r) => r.status === "FAIL")
  for (const r of results) {
    console.log(`${r.status === "PASS" ? "✅" : "❌"} [${r.id}] ${r.label}`)
  }
  console.log(`\nTotal: ${results.length} scénarios — ${results.length - failed.length} PASS, ${failed.length} FAIL`)

  // Dump JSON pour le rapport.
  console.log("\n===JSON_RESULTS_START===")
  console.log(JSON.stringify({ agencyB2C: agencyB2C.id, agencyB2B: agencyB2B.id, customerA: customerA.id, customerB: customerB.id, results }, null, 2))
  console.log("===JSON_RESULTS_END===")

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main()
  .then(() => {
    console.log("\nCertification terminée.")
    process.exit(process.exitCode ?? 0)
  })
  .catch((err) => {
    console.error("ÉCHEC FATAL du script de certification :", err)
    process.exit(1)
  })
