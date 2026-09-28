#!/usr/bin/env tsx
/**
 * scripts/financial-audit.ts — Audit financier reproductible Easy2Book V6
 *
 * Usage : npx tsx scripts/financial-audit.ts [--json]
 *
 * Catégories :
 *   A — Réservation → Financials (snapshot cohérence)
 *   B — Snapshot → Commission (wallet_ledger)
 *   C — Partner Wallet (partner_credit_movements)
 *   D — Annulation/Remboursement (reservation_financials)
 *   E — Settlement (commission_settlements ↔ wallet_ledger)
 *   F — Piste d'audit (audit_events)
 *
 * Garanties :
 *   - READ-ONLY : aucune mutation
 *   - Idempotent : deux exécutions = même résultat
 *   - Exit code 1 si P0 ou P1
 *   - Pas de secrets/PII dans la sortie
 */

// Charge .env.local avant tout import DB (tsx ne charge pas automatiquement .env.local)
import { config } from "dotenv"
import { resolve } from "path"
config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

import { and, eq, gt, isNull, isNotNull, lt, lte, not, notInArray, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  reservations,
  reservationFinancials,
  walletLedger,
  walletAccounts,
  commissionSettlements,
  auditEvents,
  partnerCreditMovements,
} from "@/lib/db/schema"
import { PLATFORM_COMMISSION_WALLET_ID } from "@/lib/finance/platform-commission"

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type Severity = "P0" | "P1" | "P2" | "P3"
type Status = "PASS" | "FAIL" | "WARNING" | "INFO" | "SKIP"

interface Finding {
  category: string
  check: string
  severity: Severity
  status: Status
  count: number
  message: string
  sample?: string[]
}

const TND_EPSILON = 0.005
const REPORT_DATE = new Date().toISOString()

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pass(category: string, check: string, message: string): Finding {
  return { category, check, severity: "P3", status: "PASS", count: 0, message }
}

function fail(category: string, check: string, severity: Severity, count: number, message: string, sample?: string[]): Finding {
  return { category, check, severity, status: "FAIL", count, message, sample }
}

function warn(category: string, check: string, count: number, message: string, sample?: string[]): Finding {
  return { category, check, severity: "P2", status: "WARNING", count, message, sample }
}

function info(category: string, check: string, message: string): Finding {
  return { category, check, severity: "P3", status: "INFO", count: 0, message }
}

/* -------------------------------------------------------------------------- */
/* A — Réservation → Financials                                                */
/* -------------------------------------------------------------------------- */

async function auditA(): Promise<Finding[]> {
  const findings: Finding[] = []

  // A1 — Réservations confirmées sans reservation_financials
  const missingFinancials = await withSystemContext((db) =>
    db
      .select({ reservationId: reservations.id, publicRef: reservations.publicRef, agencyId: reservations.agencyId })
      .from(reservations)
      .leftJoin(reservationFinancials, eq(reservations.id, reservationFinancials.reservationId))
      .where(
        and(
          eq(reservations.status, "confirmed"),
          isNull(reservationFinancials.id),
        ),
      )
      .limit(20),
  )
  if (missingFinancials.length > 0) {
    findings.push(fail("A", "A1-missing-financials", "P0", missingFinancials.length,
      `${missingFinancials.length} réservation(s) confirmed sans reservation_financials`,
      missingFinancials.slice(0, 5).map((r) => r.publicRef),
    ))
  } else {
    findings.push(pass("A", "A1-missing-financials", "Toutes les réservations confirmed ont un enregistrement financials"))
  }

  // A2 — Orphelins : reservation_financials sans réservation
  const orphanFinancials = await withSystemContext((db) =>
    db
      .select({ id: reservationFinancials.id, reservationId: reservationFinancials.reservationId })
      .from(reservationFinancials)
      .leftJoin(reservations, eq(reservationFinancials.reservationId, reservations.id))
      .where(isNull(reservations.id))
      .limit(20),
  )
  if (orphanFinancials.length > 0) {
    findings.push(fail("A", "A2-orphan-financials", "P1", orphanFinancials.length,
      `${orphanFinancials.length} reservation_financials orphelin(s) (réservation manquante)`,
      orphanFinancials.slice(0, 5).map((r) => r.reservationId),
    ))
  } else {
    findings.push(pass("A", "A2-orphan-financials", "Aucun reservation_financials orphelin"))
  }

  // A3 — Cohérence marge : marginAmount ≠ salePriceTnd - supplierPriceTnd (± TND_EPSILON)
  const marginMismatch = await withSystemContext((db) =>
    db
      .select({
        reservationId: reservationFinancials.reservationId,
        salePriceTnd: reservationFinancials.salePriceTnd,
        supplierPriceTnd: reservationFinancials.supplierPriceTnd,
        marginAmount: reservationFinancials.marginAmount,
      })
      .from(reservationFinancials)
      .where(
        gt(
          sql<number>`ABS(${reservationFinancials.marginAmount}::numeric - (${reservationFinancials.salePriceTnd}::numeric - ${reservationFinancials.supplierPriceTnd}::numeric))`,
          TND_EPSILON,
        ),
      )
      .limit(20),
  )
  if (marginMismatch.length > 0) {
    findings.push(fail("A", "A3-margin-mismatch", "P1", marginMismatch.length,
      `${marginMismatch.length} enregistrement(s) avec marge incohérente (|margin ≠ sale - supplier| > ${TND_EPSILON})`,
      marginMismatch.slice(0, 5).map((r) => `${r.reservationId}: margin=${r.marginAmount} sale=${r.salePriceTnd} supplier=${r.supplierPriceTnd}`),
    ))
  } else {
    findings.push(pass("A", "A3-margin-mismatch", `Toutes les marges cohérentes (formule: sale - supplier ± ${TND_EPSILON})`))
  }

  // A4 — Commission formula check : commissionAmount ≠ ROUND(marginAmount * commissionPercent/100, 2)
  const commissionFormulaMismatch = await withSystemContext((db) =>
    db
      .select({
        reservationId: reservationFinancials.reservationId,
        commissionAmount: reservationFinancials.commissionAmount,
        marginAmount: reservationFinancials.marginAmount,
        commissionPercent: reservationFinancials.commissionPercent,
      })
      .from(reservationFinancials)
      .where(
        and(
          gt(sql<number>`${reservationFinancials.commissionPercent}::numeric`, 0),
          gt(
            sql<number>`ABS(${reservationFinancials.commissionAmount}::numeric - ROUND(${reservationFinancials.marginAmount}::numeric * ${reservationFinancials.commissionPercent}::numeric / 100, 2))`,
            TND_EPSILON,
          ),
        ),
      )
      .limit(20),
  )
  if (commissionFormulaMismatch.length > 0) {
    findings.push(fail("A", "A4-commission-formula", "P1", commissionFormulaMismatch.length,
      `${commissionFormulaMismatch.length} commission(s) ne respectent pas ROUND(margin * rate/100, 2)`,
      commissionFormulaMismatch.slice(0, 5).map((r) =>
        `${r.reservationId}: commission=${r.commissionAmount} margin=${r.marginAmount} rate=${r.commissionPercent}%`,
      ),
    ))
  } else {
    findings.push(pass("A", "A4-commission-formula", "Toutes les commissions respectent ROUND(margin * rate/100, 2)"))
  }

  // A5 — Doublons reservation_financials (unique index défense)
  const [dupCheck] = await withSystemContext((db) =>
    db
      .select({
        duplicates: sql<number>`COUNT(*) - COUNT(DISTINCT ${reservationFinancials.reservationId})`,
      })
      .from(reservationFinancials),
  )
  const dupCount = Number(dupCheck?.duplicates) || 0
  if (dupCount > 0) {
    findings.push(fail("A", "A5-duplicate-financials", "P0", dupCount,
      `${dupCount} doublon(s) détecté(s) dans reservation_financials (violation unique index)`,
    ))
  } else {
    findings.push(pass("A", "A5-duplicate-financials", "Aucun doublon dans reservation_financials"))
  }

  // A6 — Commission > margin (incohérence économique)
  const commissionOverMargin = await withSystemContext((db) =>
    db
      .select({ reservationId: reservationFinancials.reservationId, commissionAmount: reservationFinancials.commissionAmount, marginAmount: reservationFinancials.marginAmount })
      .from(reservationFinancials)
      .where(
        gt(
          sql<number>`${reservationFinancials.commissionAmount}::numeric`,
          sql<number>`${reservationFinancials.marginAmount}::numeric + ${TND_EPSILON}`,
        ),
      )
      .limit(20),
  )
  if (commissionOverMargin.length > 0) {
    findings.push(warn("A", "A6-commission-over-margin", commissionOverMargin.length,
      `${commissionOverMargin.length} commission(s) > marge (incohérence économique)`,
      commissionOverMargin.slice(0, 5).map((r) => `${r.reservationId}: commission=${r.commissionAmount} > margin=${r.marginAmount}`),
    ))
  } else {
    findings.push(pass("A", "A6-commission-over-margin", "Aucune commission supérieure à la marge"))
  }

  return findings
}

/* -------------------------------------------------------------------------- */
/* B — Snapshot → Commission (wallet_ledger)                                   */
/* -------------------------------------------------------------------------- */

async function auditB(): Promise<Finding[]> {
  const findings: Finding[] = []

  // B1 — Commissions dans reservation_financials > 0 sans entrée wallet_ledger
  const commissionWithoutWallet = await withSystemContext((db) =>
    db
      .select({
        reservationId: reservationFinancials.reservationId,
        commissionAmount: reservationFinancials.commissionAmount,
      })
      .from(reservationFinancials)
      .leftJoin(
        walletLedger,
        and(
          eq(walletLedger.reservationId, reservationFinancials.reservationId),
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
        ),
      )
      .where(
        and(
          gt(sql<number>`${reservationFinancials.commissionAmount}::numeric`, TND_EPSILON),
          isNull(walletLedger.id),
        ),
      )
      .limit(20),
  )
  if (commissionWithoutWallet.length > 0) {
    findings.push(fail("B", "B1-commission-without-wallet", "P1", commissionWithoutWallet.length,
      `${commissionWithoutWallet.length} commission(s) enregistrée(s) mais non créditée(s) dans wallet_ledger`,
      commissionWithoutWallet.slice(0, 5).map((r) => `${r.reservationId}: ${r.commissionAmount} DT`),
    ))
  } else {
    findings.push(pass("B", "B1-commission-without-wallet", "Toutes les commissions sont créditées dans wallet_ledger"))
  }

  // B2 — Entrées wallet_ledger commission sans reservation_financials correspondant
  const walletWithoutFinancials = await withSystemContext((db) =>
    db
      .select({ id: walletLedger.id, reservationId: walletLedger.reservationId, amount: walletLedger.amount })
      .from(walletLedger)
      .leftJoin(reservationFinancials, eq(walletLedger.reservationId, reservationFinancials.reservationId))
      .where(
        and(
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
          isNotNull(walletLedger.reservationId),
          isNull(reservationFinancials.id),
        ),
      )
      .limit(20),
  )
  if (walletWithoutFinancials.length > 0) {
    findings.push(warn("B", "B2-wallet-without-financials", walletWithoutFinancials.length,
      `${walletWithoutFinancials.length} entrée(s) commission wallet_ledger sans reservation_financials`,
      walletWithoutFinancials.slice(0, 5).map((r) => `${r.reservationId}: ${r.amount} DT`),
    ))
  } else {
    findings.push(pass("B", "B2-wallet-without-financials", "Aucune entrée commission orpheline dans wallet_ledger"))
  }

  // B3 — Commission wallet_ledger négative (montant debit invalide)
  const negativeCommission = await withSystemContext((db) =>
    db
      .select({ id: walletLedger.id, amount: walletLedger.amount, reservationId: walletLedger.reservationId })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
          lt(sql<number>`${walletLedger.amount}::numeric`, 0),
        ),
      )
      .limit(20),
  )
  if (negativeCommission.length > 0) {
    findings.push(warn("B", "B3-negative-commission", negativeCommission.length,
      `${negativeCommission.length} entrée(s) commission wallet avec montant négatif`,
      negativeCommission.slice(0, 5).map((r) => `${r.reservationId}: ${r.amount} DT`),
    ))
  } else {
    findings.push(pass("B", "B3-negative-commission", "Aucune commission négative dans wallet_ledger"))
  }

  // B4 — Résumé balance platform commission wallet
  const [walletSummary] = await withSystemContext((db) =>
    db
      .select({
        totalCredit: sql<number>`COALESCE(SUM(${walletLedger.amount}::numeric), 0)`,
        entryCount: sql<number>`COUNT(*)`,
      })
      .from(walletLedger)
      .where(eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID)),
  )
  findings.push(info("B", "B4-wallet-balance",
    `Balance wallet commission platform : ${fmt(Number(walletSummary?.totalCredit) || 0)} DT (${walletSummary?.entryCount || 0} entrées)`,
  ))

  return findings
}

/* -------------------------------------------------------------------------- */
/* C — Partner Wallet (partner_credit_movements)                               */
/* -------------------------------------------------------------------------- */

async function auditC(): Promise<Finding[]> {
  const findings: Finding[] = []

  // C1 — Mouvements sans réservation valide (si reservation_id renseigné)
  const orphanMovements = await withSystemContext((db) =>
    db
      .select({ id: partnerCreditMovements.id, reservationId: partnerCreditMovements.reservationId, agencyId: partnerCreditMovements.agencyId })
      .from(partnerCreditMovements)
      .leftJoin(reservations, eq(partnerCreditMovements.reservationId, reservations.id))
      .where(
        and(
          isNotNull(partnerCreditMovements.reservationId),
          isNull(reservations.id),
        ),
      )
      .limit(20),
  )
  if (orphanMovements.length > 0) {
    findings.push(warn("C", "C1-orphan-movements", orphanMovements.length,
      `${orphanMovements.length} mouvement(s) partner avec reservation_id invalide`,
      orphanMovements.slice(0, 5).map((r) => `${r.id} → res ${r.reservationId}`),
    ))
  } else {
    findings.push(pass("C", "C1-orphan-movements", "Aucun mouvement partner avec reservation_id invalide"))
  }

  // C2 — Mouvements sans agencyId valide
  const [noAgency] = await withSystemContext((db) =>
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(partnerCreditMovements)
      .where(isNull(partnerCreditMovements.agencyId)),
  )
  const noAgencyCount = Number(noAgency?.count) || 0
  if (noAgencyCount > 0) {
    findings.push(fail("C", "C2-missing-agency", "P1", noAgencyCount,
      `${noAgencyCount} mouvement(s) partner_credit_movements sans agencyId`,
    ))
  } else {
    findings.push(pass("C", "C2-missing-agency", "Tous les mouvements partner ont un agencyId"))
  }

  // C3 — Doublons débit par réservation (un seul débit attendu par réservation)
  const [dupDebits] = await withSystemContext((db) =>
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(
        db
          .select({
            reservationId: partnerCreditMovements.reservationId,
            agencyId: partnerCreditMovements.agencyId,
            debitCount: sql<number>`COUNT(*)`.as("debit_count"),
          })
          .from(partnerCreditMovements)
          .where(
            and(
              isNotNull(partnerCreditMovements.reservationId),
              eq(partnerCreditMovements.movementType, "debit"),
            ),
          )
          .groupBy(partnerCreditMovements.reservationId, partnerCreditMovements.agencyId)
          .having(gt(sql<number>`COUNT(*)`, 1))
          .as("dup_debits"),
      ),
  )
  const dupDebitCount = Number(dupDebits?.count) || 0
  if (dupDebitCount > 0) {
    findings.push(warn("C", "C3-duplicate-debits", dupDebitCount,
      `${dupDebitCount} réservation(s) avec plusieurs débits partner_credit_movements`,
    ))
  } else {
    findings.push(pass("C", "C3-duplicate-debits", "Aucun débit dupliqué dans partner_credit_movements"))
  }

  // C4 — Résumé par type
  const movementSummary = await withSystemContext((db) =>
    db
      .select({
        movementType: partnerCreditMovements.movementType,
        total: sql<number>`COALESCE(SUM(${partnerCreditMovements.amount}::numeric), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(partnerCreditMovements)
      .groupBy(partnerCreditMovements.movementType),
  )
  const summaryStr = movementSummary
    .map((r) => `${r.movementType}: ${fmt(Number(r.total))} DT (n=${r.count})`)
    .join(", ") || "aucun mouvement"
  findings.push(info("C", "C4-movement-summary", `Mouvements partner : ${summaryStr}`))

  return findings
}

/* -------------------------------------------------------------------------- */
/* D — Annulation / Remboursement                                              */
/* -------------------------------------------------------------------------- */

async function auditD(): Promise<Finding[]> {
  const findings: Finding[] = []

  // D1 — Réservations cancelled sans cancellationFee ni refundAmount dans financials
  const cancelledWithoutFinancials = await withSystemContext((db) =>
    db
      .select({ reservationId: reservations.id, publicRef: reservations.publicRef })
      .from(reservations)
      .innerJoin(reservationFinancials, eq(reservations.id, reservationFinancials.reservationId))
      .where(
        and(
          eq(reservations.status, "cancelled"),
          isNull(reservationFinancials.cancelledAt),
        ),
      )
      .limit(20),
  )
  if (cancelledWithoutFinancials.length > 0) {
    findings.push(warn("D", "D1-cancelled-no-financial-update", cancelledWithoutFinancials.length,
      `${cancelledWithoutFinancials.length} réservation(s) cancelled sans mise à jour financials (cancelledAt NULL)`,
      cancelledWithoutFinancials.slice(0, 5).map((r) => r.publicRef),
    ))
  } else {
    findings.push(pass("D", "D1-cancelled-no-financial-update", "Toutes les réservations cancelled ont cancelledAt renseigné"))
  }

  // D2 — refundAmount négatif (impossible)
  const negativeRefund = await withSystemContext((db) =>
    db
      .select({ reservationId: reservationFinancials.reservationId, refundAmount: reservationFinancials.refundAmount })
      .from(reservationFinancials)
      .where(
        and(
          isNotNull(reservationFinancials.refundAmount),
          lt(sql<number>`${reservationFinancials.refundAmount}::numeric`, 0),
        ),
      )
      .limit(20),
  )
  if (negativeRefund.length > 0) {
    findings.push(fail("D", "D2-negative-refund", "P0", negativeRefund.length,
      `${negativeRefund.length} remboursement(s) négatif(s) — montant impossible`,
      negativeRefund.slice(0, 5).map((r) => `${r.reservationId}: ${r.refundAmount} DT`),
    ))
  } else {
    findings.push(pass("D", "D2-negative-refund", "Aucun remboursement négatif"))
  }

  // D3 — refundAmount > salePriceTnd (impossible économiquement)
  const refundOverSale = await withSystemContext((db) =>
    db
      .select({ reservationId: reservationFinancials.reservationId, refundAmount: reservationFinancials.refundAmount, salePriceTnd: reservationFinancials.salePriceTnd })
      .from(reservationFinancials)
      .where(
        and(
          isNotNull(reservationFinancials.refundAmount),
          gt(
            sql<number>`${reservationFinancials.refundAmount}::numeric`,
            sql<number>`${reservationFinancials.salePriceTnd}::numeric + ${TND_EPSILON}`,
          ),
        ),
      )
      .limit(20),
  )
  if (refundOverSale.length > 0) {
    findings.push(fail("D", "D3-refund-over-sale", "P1", refundOverSale.length,
      `${refundOverSale.length} remboursement(s) > prix de vente`,
      refundOverSale.slice(0, 5).map((r) => `${r.reservationId}: refund=${r.refundAmount} > sale=${r.salePriceTnd}`),
    ))
  } else {
    findings.push(pass("D", "D3-refund-over-sale", "Aucun remboursement supérieur au prix de vente"))
  }

  // D4 — cancellationFee négatif (impossible)
  const negativeFee = await withSystemContext((db) =>
    db
      .select({ reservationId: reservationFinancials.reservationId, cancellationFee: reservationFinancials.cancellationFee })
      .from(reservationFinancials)
      .where(
        and(
          isNotNull(reservationFinancials.cancellationFee),
          lt(sql<number>`${reservationFinancials.cancellationFee}::numeric`, 0),
        ),
      )
      .limit(20),
  )
  if (negativeFee.length > 0) {
    findings.push(fail("D", "D4-negative-cancellation-fee", "P0", negativeFee.length,
      `${negativeFee.length} frais d'annulation négatif(s) — montant impossible`,
      negativeFee.slice(0, 5).map((r) => `${r.reservationId}: ${r.cancellationFee} DT`),
    ))
  } else {
    findings.push(pass("D", "D4-negative-cancellation-fee", "Aucun frais d'annulation négatif"))
  }

  // D5 — Résumé annulations
  const [cancelSummary] = await withSystemContext((db) =>
    db
      .select({
        total: sql<number>`COUNT(*)`,
        withFee: sql<number>`SUM(CASE WHEN ${reservationFinancials.cancellationFee} IS NOT NULL THEN 1 ELSE 0 END)`,
        totalFees: sql<number>`COALESCE(SUM(${reservationFinancials.cancellationFee}::numeric), 0)`,
        totalRefunded: sql<number>`COALESCE(SUM(${reservationFinancials.refundAmount}::numeric), 0)`,
      })
      .from(reservationFinancials)
      .where(isNotNull(reservationFinancials.cancelledAt)),
  )
  findings.push(info("D", "D5-cancellation-summary",
    `Annulations : ${cancelSummary?.total || 0} total, ${cancelSummary?.withFee || 0} avec frais, ` +
    `fees=${fmt(Number(cancelSummary?.totalFees) || 0)} DT, remboursés=${fmt(Number(cancelSummary?.totalRefunded) || 0)} DT`,
  ))

  return findings
}

/* -------------------------------------------------------------------------- */
/* E — Settlement                                                               */
/* -------------------------------------------------------------------------- */

async function auditE(): Promise<Finding[]> {
  const findings: Finding[] = []

  // E1 — Vérification totalAmount vs somme réelle des entrées settlées
  const settlements = await withSystemContext((db) =>
    db
      .select({
        id: commissionSettlements.id,
        periodStart: commissionSettlements.periodStart,
        periodEnd: commissionSettlements.periodEnd,
        totalAmount: commissionSettlements.totalAmount,
        ledgerEntryCount: commissionSettlements.ledgerEntryCount,
        status: commissionSettlements.status,
        settledAt: commissionSettlements.settledAt,
      })
      .from(commissionSettlements),
  )

  if (settlements.length === 0) {
    findings.push(info("E", "E0-no-settlements", "Aucun settlement créé — vérification E1/E2 ignorée"))
  } else {
    for (const s of settlements) {
      const [actual] = await withSystemContext((db) =>
        db
          .select({
            actualAmount: sql<number>`COALESCE(SUM(${walletLedger.amount}::numeric), 0)`,
            actualCount: sql<number>`COUNT(*)`,
          })
          .from(walletLedger)
          .where(eq(walletLedger.settlementId, s.id)),
      )
      const declaredAmount = Number(s.totalAmount) || 0
      const actualAmount = Number(actual?.actualAmount) || 0
      const declaredCount = s.ledgerEntryCount || 0
      const actualCount = Number(actual?.actualCount) || 0

      if (Math.abs(declaredAmount - actualAmount) > TND_EPSILON) {
        findings.push(fail("E", "E1-settlement-amount-mismatch", "P0", 1,
          `Settlement ${s.id} (${s.periodStart}→${s.periodEnd}): déclaré=${fmt(declaredAmount)} ≠ réel=${fmt(actualAmount)} DT`,
        ))
      }
      if (declaredCount !== actualCount) {
        findings.push(warn("E", "E1-settlement-count-mismatch", 1,
          `Settlement ${s.id}: ledger_entry_count déclaré=${declaredCount} ≠ réel=${actualCount}`,
        ))
      }
    }

    // E2 — Entrées settlées (settled_at non null) sans settlement_id valide
    const orphanSettled = await withSystemContext((db) =>
      db
        .select({ id: walletLedger.id, settlementId: walletLedger.settlementId })
        .from(walletLedger)
        .leftJoin(commissionSettlements, eq(walletLedger.settlementId, commissionSettlements.id))
        .where(
          and(
            isNotNull(walletLedger.settledAt),
            isNotNull(walletLedger.settlementId),
            isNull(commissionSettlements.id),
          ),
        )
        .limit(20),
    )
    if (orphanSettled.length > 0) {
      findings.push(fail("E", "E2-orphan-settled-entries", "P1", orphanSettled.length,
        `${orphanSettled.length} entrée(s) wallet_ledger avec settlement_id invalide`,
        orphanSettled.slice(0, 5).map((r) => `${r.id} → settlement ${r.settlementId}`),
      ))
    } else {
      findings.push(pass("E", "E2-orphan-settled-entries", "Aucune entrée wallet_ledger avec settlement_id invalide"))
    }

    // E3 — Settlements 'paid' sans settledAt
    const paidWithoutDate = await withSystemContext((db) =>
      db
        .select({ id: commissionSettlements.id, status: commissionSettlements.status })
        .from(commissionSettlements)
        .where(
          and(
            eq(commissionSettlements.status, "paid"),
            isNull(commissionSettlements.settledAt),
          ),
        )
        .limit(20),
    )
    if (paidWithoutDate.length > 0) {
      findings.push(fail("E", "E3-paid-without-date", "P1", paidWithoutDate.length,
        `${paidWithoutDate.length} settlement(s) status='paid' sans settledAt`,
        paidWithoutDate.slice(0, 5).map((r) => r.id),
      ))
    } else {
      findings.push(pass("E", "E3-paid-without-date", "Tous les settlements 'paid' ont un settledAt"))
    }

    // E4 — Résumé settlements
    const pendingSettlements = settlements.filter((s) => s.status === "pending")
    const paidSettlements = settlements.filter((s) => s.status === "paid")
    const totalPending = pendingSettlements.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0)
    const totalPaid = paidSettlements.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0)
    findings.push(info("E", "E4-settlement-summary",
      `Settlements: ${settlements.length} total — ${paidSettlements.length} payés (${fmt(totalPaid)} DT), ${pendingSettlements.length} en attente (${fmt(totalPending)} DT)`,
    ))
  }

  // E5 — Balance non settlée
  const [unsettledBalance] = await withSystemContext((db) =>
    db
      .select({
        balance: sql<number>`COALESCE(SUM(${walletLedger.amount}::numeric), 0)`,
        entries: sql<number>`COUNT(*)`,
      })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
          isNull(walletLedger.settlementId),
        ),
      ),
  )
  findings.push(info("E", "E5-unsettled-balance",
    `Balance non settlée : ${fmt(Number(unsettledBalance?.balance) || 0)} DT (${unsettledBalance?.entries || 0} entrées)`,
  ))

  return findings
}

/* -------------------------------------------------------------------------- */
/* F — Piste d'audit (audit_events)                                            */
/* -------------------------------------------------------------------------- */

async function auditF(): Promise<Finding[]> {
  const findings: Finding[] = []

  // F1 — Réservations confirmed sans audit event reservation.confirmed ou reservation.created
  const confirmedWithoutAudit = await withSystemContext((db) =>
    db
      .select({ reservationId: reservations.id, publicRef: reservations.publicRef })
      .from(reservations)
      .leftJoin(
        auditEvents,
        and(
          eq(auditEvents.entityId, reservations.id),
          eq(auditEvents.entityType, "reservation"),
        ),
      )
      .where(
        and(
          eq(reservations.status, "confirmed"),
          isNull(auditEvents.id),
        ),
      )
      .limit(20),
  )
  if (confirmedWithoutAudit.length > 0) {
    findings.push(warn("F", "F1-confirmed-no-audit", confirmedWithoutAudit.length,
      `${confirmedWithoutAudit.length} réservation(s) confirmed sans aucun audit event`,
      confirmedWithoutAudit.slice(0, 5).map((r) => r.publicRef),
    ))
  } else {
    findings.push(pass("F", "F1-confirmed-no-audit", "Toutes les réservations confirmed ont au moins un audit event"))
  }

  // F2 — Réservations cancelled sans audit event cancel
  const cancelledWithoutAudit = await withSystemContext((db) =>
    db
      .select({ reservationId: reservations.id, publicRef: reservations.publicRef })
      .from(reservations)
      .leftJoin(
        auditEvents,
        and(
          eq(auditEvents.entityId, reservations.id),
          eq(auditEvents.entityType, "reservation"),
          sql`${auditEvents.action} LIKE 'reservation.cancel%'`,
        ),
      )
      .where(
        and(
          eq(reservations.status, "cancelled"),
          isNull(auditEvents.id),
        ),
      )
      .limit(20),
  )
  if (cancelledWithoutAudit.length > 0) {
    findings.push(warn("F", "F2-cancelled-no-audit", cancelledWithoutAudit.length,
      `${cancelledWithoutAudit.length} réservation(s) cancelled sans audit event 'reservation.cancel*'`,
      cancelledWithoutAudit.slice(0, 5).map((r) => r.publicRef),
    ))
  } else {
    findings.push(pass("F", "F2-cancelled-no-audit", "Toutes les réservations cancelled ont un audit event cancel"))
  }

  // F3 — Résumé audit events
  const [auditSummary] = await withSystemContext((db) =>
    db.select({ count: sql<number>`COUNT(*)` }).from(auditEvents),
  )
  findings.push(info("F", "F3-audit-total",
    `Total audit events : ${auditSummary?.count || 0}`,
  ))

  return findings
}

/* -------------------------------------------------------------------------- */
/* Rendu                                                                        */
/* -------------------------------------------------------------------------- */

const SEVERITY_ORDER: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
const STATUS_ICON: Record<Status, string> = {
  PASS: "✓",
  FAIL: "✗",
  WARNING: "⚠",
  INFO: "i",
  SKIP: "-",
}

function printReport(findings: Finding[], duration: number): boolean {
  const failures = findings.filter((f) => f.status === "FAIL")
  const warnings = findings.filter((f) => f.status === "WARNING")
  const passes = findings.filter((f) => f.status === "PASS")

  const p0 = failures.filter((f) => f.severity === "P0")
  const p1 = failures.filter((f) => f.severity === "P1")
  const critical = p0.length + p1.length

  console.log()
  console.log("═══════════════════════════════════════════════════════════════")
  console.log("  EASY2BOOK — AUDIT FINANCIER REPRODUCTIBLE")
  console.log(`  ${REPORT_DATE}`)
  console.log("═══════════════════════════════════════════════════════════════")
  console.log()

  // Grouper par catégorie
  const categories = [...new Set(findings.map((f) => f.category))].sort()
  for (const cat of categories) {
    const catFindings = findings.filter((f) => f.category === cat)
    const catLabel: Record<string, string> = {
      A: "A — Réservation → Financials",
      B: "B — Snapshot → Commission Wallet",
      C: "C — Partner Wallet",
      D: "D — Annulation / Remboursement",
      E: "E — Settlement",
      F: "F — Piste d'audit",
    }
    console.log(`  ─── ${catLabel[cat] || cat} ───`)
    for (const f of catFindings) {
      const icon = STATUS_ICON[f.status]
      const sev = f.status === "FAIL" ? ` [${f.severity}]` : ""
      const count = f.count > 0 ? ` (${f.count})` : ""
      console.log(`  ${icon}${sev} ${f.check}${count}`)
      console.log(`      ${f.message}`)
      if (f.sample && f.sample.length > 0) {
        for (const s of f.sample.slice(0, 3)) {
          console.log(`      → ${s}`)
        }
      }
    }
    console.log()
  }

  console.log("───────────────────────────────────────────────────────────────")
  console.log(`  RÉSULTAT : ${passes.length} PASS  ${warnings.length} WARNING  ${failures.length} FAIL`)
  console.log(`  Critiques (P0+P1) : ${critical}  |  Durée : ${duration}ms`)

  if (critical > 0) {
    console.log()
    console.log("  ⛔ AUDIT ÉCHOUÉ — Blockers critiques détectés :")
    for (const f of [...p0, ...p1]) {
      console.log(`     [${f.severity}] ${f.check}: ${f.message}`)
    }
    console.log("═══════════════════════════════════════════════════════════════")
    console.log()
  } else if (warnings.length > 0) {
    console.log()
    console.log("  ⚠  AUDIT RÉUSSI AVEC WARNINGS — Aucun bloquant critique")
    console.log("═══════════════════════════════════════════════════════════════")
    console.log()
  } else {
    console.log()
    console.log("  ✅ AUDIT RÉUSSI — Aucune anomalie détectée")
    console.log("═══════════════════════════════════════════════════════════════")
    console.log()
  }

  return critical > 0
}

/* -------------------------------------------------------------------------- */
/* Main                                                                         */
/* -------------------------------------------------------------------------- */

async function main() {
  const start = Date.now()
  const jsonMode = process.argv.includes("--json")

  console.log("Connexion base de données…")

  const allFindings: Finding[] = []

  try {
    const [a, b, c, d, e, f] = await Promise.all([
      auditA(),
      auditB(),
      auditC(),
      auditD(),
      auditE(),
      auditF(),
    ])
    allFindings.push(...a, ...b, ...c, ...d, ...e, ...f)
  } catch (err) {
    console.error("Erreur lors de l'audit :", err instanceof Error ? err.message : String(err))
    process.exit(2)
  }

  const duration = Date.now() - start

  if (jsonMode) {
    const critical = allFindings.filter((f) => f.status === "FAIL" && (f.severity === "P0" || f.severity === "P1"))
    console.log(JSON.stringify({
      reportDate: REPORT_DATE,
      durationMs: duration,
      summary: {
        pass: allFindings.filter((f) => f.status === "PASS").length,
        warning: allFindings.filter((f) => f.status === "WARNING").length,
        fail: allFindings.filter((f) => f.status === "FAIL").length,
        critical: critical.length,
        exitCode: critical.length > 0 ? 1 : 0,
      },
      findings: allFindings,
    }, null, 2))
    if (critical.length > 0) process.exit(1)
    return
  }

  const hasCritical = printReport(allFindings, duration)
  if (hasCritical) process.exit(1)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(2)
})
