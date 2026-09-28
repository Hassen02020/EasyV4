/**
 * Settlement des commissions Easy2Book — Chantier 37C.
 *
 * Agrège les entrées `wallet_ledger` (category=commission, non settlées)
 * sur une période donnée, crée un enregistrement `commission_settlements`
 * et marque les entrées comme settlées (settled_at + settlement_id).
 *
 * Seul un super_admin peut déclencher un settlement (vérifié en amont par
 * l'appelant — cette fonction ne résout pas elle-même la session).
 *
 * Cycle de vie :
 *   1. settleCommissions() → status='pending'
 *   2. markSettlementPaid()  → status='paid' (après virement réel)
 */

"use server"

import { and, eq, gte, isNull, lte, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { commissionSettlements, walletLedger } from "@/lib/db/schema"
import { PLATFORM_COMMISSION_WALLET_ID } from "./platform-commission"

export interface CommissionSettlementResult {
  settlementId: string
  periodStart: Date
  periodEnd: Date
  totalAmount: number
  entryCount: number
  status: "pending"
}

/**
 * Crée un settlement pour la période donnée.
 * Idempotence : si aucune entrée non settlée n'existe → retourne un
 * settlement vide (totalAmount=0, entryCount=0) sans écrire en base.
 */
export async function settleCommissions(
  periodStart: Date,
  periodEnd: Date,
  settledBy: string,
  notes?: string,
): Promise<CommissionSettlementResult> {
  return withSystemContext(async (tx) => {
    // 1. Agréger les entrées commission non settlées sur la période
    const [summary] = await tx
      .select({
        totalAmount: sql<number>`COALESCE(SUM(amount), 0)`,
        entryCount: sql<number>`COUNT(*)`,
      })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
          eq(walletLedger.category, "commission"),
          isNull(walletLedger.settledAt),
          gte(walletLedger.createdAt, periodStart),
          lte(walletLedger.createdAt, periodEnd),
        ),
      )

    const totalAmount = Number(summary?.totalAmount) || 0
    const entryCount = Number(summary?.entryCount) || 0

    // 2. Créer le settlement (même si vide — trace de la période vérifiée)
    const [settlement] = await tx
      .insert(commissionSettlements)
      .values({
        periodStart: periodStart.toISOString().split("T")[0],
        periodEnd: periodEnd.toISOString().split("T")[0],
        totalAmount: totalAmount.toFixed(2),
        ledgerEntryCount: entryCount,
        status: "pending",
        notes: notes ?? null,
        settledBy,
      })
      .returning({ id: commissionSettlements.id })

    // 3. Marquer les entrées comme settlées
    if (entryCount > 0) {
      await tx
        .update(walletLedger)
        .set({ settledAt: new Date(), settlementId: settlement.id })
        .where(
          and(
            eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
            eq(walletLedger.category, "commission"),
            isNull(walletLedger.settledAt),
            gte(walletLedger.createdAt, periodStart),
            lte(walletLedger.createdAt, periodEnd),
          ),
        )
    }

    return {
      settlementId: settlement.id,
      periodStart,
      periodEnd,
      totalAmount,
      entryCount,
      status: "pending",
    }
  })
}

/**
 * Passe un settlement de 'pending' → 'paid' après virement réel effectué.
 * Seul un super_admin peut appeler cette fonction.
 */
export async function markSettlementPaid(
  settlementId: string,
  paidBy: string,
): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx
      .update(commissionSettlements)
      .set({ status: "paid", settledAt: new Date(), settledBy: paidBy, updatedAt: new Date() })
      .where(eq(commissionSettlements.id, settlementId))
  })
}

/**
 * Récupère le solde de commissions non encore settlées
 * (toutes périodes confondues).
 */
export async function getUnsettledCommissionBalance(): Promise<number> {
  return withSystemContext(async (tx) => {
    const [row] = await tx
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
          eq(walletLedger.category, "commission"),
          isNull(walletLedger.settledAt),
        ),
      )
    return Number(row?.total) || 0
  })
}
