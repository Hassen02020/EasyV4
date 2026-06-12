/**
 * Données financières Backoffice — mouvements wallet cross-agences.
 *
 * Expose :
 *   - loadFinanceMovements()  : ledger partnerCreditMovements paginé
 *   - loadFinanceKpis()       : agrégats KPI pour la page dashboard
 *   - loadRechargeRequests()  : demandes de recharge en attente
 */

import { and, desc, eq, gte, lt, sql, count } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import {
  agencies,
  partnerCreditMovements,
  walletRechargeRequests,
} from "@/lib/db/schema"
import { logger } from "@/lib/logger"

/* -------------------------------------------------------------------------- */
/* Types                                                                        */
/* -------------------------------------------------------------------------- */

export type FinanceMovementRow = {
  id: string
  agencyId: string
  agencyName: string
  movementType: string
  /** Montant TND signé (négatif = débit) */
  amount: number
  balanceAfter: number
  reference: string | null
  description: string | null
  createdAt: Date
}

export type RechargeRequestRow = {
  id: string
  agencyId: string
  agencyName: string
  amount: number
  method: string
  paymentReference: string | null
  note: string | null
  status: string
  proofUrl: string | null
  createdAt: Date
  reviewedAt: Date | null
}

export type FinanceKpis = {
  totalCreditsMonth: number
  totalDebitsMonth: number
  pendingRechargesCount: number
  pendingRechargesAmount: number
  totalWalletBalance: number
}

/* -------------------------------------------------------------------------- */
/* KPIs                                                                         */
/* -------------------------------------------------------------------------- */

export async function loadFinanceKpis(): Promise<FinanceKpis> {
  const empty: FinanceKpis = {
    totalCreditsMonth: 0,
    totalDebitsMonth: 0,
    pendingRechargesCount: 0,
    pendingRechargesAmount: 0,
    totalWalletBalance: 0,
  }
  if (!process.env.DATABASE_URL) return empty

  const db = getDb()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  try {
    const [creditsRow, debitsRow, pendingRow, balanceRow] = await Promise.all([
      db
        .select({
          total: sql<string>`COALESCE(SUM(${partnerCreditMovements.amount}::numeric), 0)`,
        })
        .from(partnerCreditMovements)
        .where(
          and(
            eq(partnerCreditMovements.movementType, "credit"),
            gte(partnerCreditMovements.createdAt, since),
          ),
        ),

      db
        .select({
          total: sql<string>`COALESCE(SUM(ABS(${partnerCreditMovements.amount}::numeric)), 0)`,
        })
        .from(partnerCreditMovements)
        .where(
          and(
            eq(partnerCreditMovements.movementType, "debit"),
            gte(partnerCreditMovements.createdAt, since),
          ),
        ),

      db
        .select({
          cnt: count(walletRechargeRequests.id),
          total: sql<string>`COALESCE(SUM(${walletRechargeRequests.amount}::numeric), 0)`,
        })
        .from(walletRechargeRequests)
        .where(eq(walletRechargeRequests.status, "pending")),

      db
        .select({
          total: sql<string>`COALESCE(SUM(${agencies.depositBalance}::numeric), 0)`,
        })
        .from(agencies)
        .where(eq(agencies.status, "active")),
    ])

    return {
      totalCreditsMonth: parseFloat(creditsRow[0]?.total ?? "0"),
      totalDebitsMonth: parseFloat(debitsRow[0]?.total ?? "0"),
      pendingRechargesCount: pendingRow[0]?.cnt ?? 0,
      pendingRechargesAmount: parseFloat(pendingRow[0]?.total ?? "0"),
      totalWalletBalance: parseFloat(balanceRow[0]?.total ?? "0"),
    }
  } catch (err) {
    logger.error("loadFinanceKpis failed", {
      err: err instanceof Error ? err.message : String(err),
    })
    return empty
  }
}

/* -------------------------------------------------------------------------- */
/* Mouvements wallet paginés                                                    */
/* -------------------------------------------------------------------------- */

export type FinanceMovementsOpts = {
  agencyId?: string | null
  movementType?: string | null
  since?: Date | null
  cursor?: string | null
  limit?: number
}

export type FinanceMovementsResult = {
  rows: FinanceMovementRow[]
  nextCursor: string | null
  hasMore: boolean
}

export async function loadFinanceMovements(
  opts: FinanceMovementsOpts = {},
): Promise<FinanceMovementsResult> {
  const empty: FinanceMovementsResult = {
    rows: [],
    nextCursor: null,
    hasMore: false,
  }
  if (!process.env.DATABASE_URL) return empty

  const limit = opts.limit ?? 50
  const db = getDb()

  try {
    const conditions = [
      opts.agencyId
        ? eq(partnerCreditMovements.agencyId, opts.agencyId)
        : undefined,
      opts.movementType
        ? eq(
            partnerCreditMovements.movementType,
            opts.movementType as "credit",
          )
        : undefined,
      opts.since
        ? gte(partnerCreditMovements.createdAt, opts.since)
        : undefined,
      opts.cursor
        ? lt(partnerCreditMovements.createdAt, new Date(opts.cursor))
        : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined)

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await db
      .select({
        id: partnerCreditMovements.id,
        agencyId: partnerCreditMovements.agencyId,
        agencyName: sql<string>`COALESCE(${agencies.brandName}, ${agencies.name}, '')`,
        movementType: partnerCreditMovements.movementType,
        amount: partnerCreditMovements.amount,
        balanceAfter: partnerCreditMovements.balanceAfter,
        reference: partnerCreditMovements.reference,
        description: partnerCreditMovements.description,
        createdAt: partnerCreditMovements.createdAt,
      })
      .from(partnerCreditMovements)
      .leftJoin(agencies, eq(agencies.id, partnerCreditMovements.agencyId))
      .where(where)
      .orderBy(desc(partnerCreditMovements.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore
      ? pageRows.at(-1)!.createdAt.toISOString()
      : null

    return {
      rows: pageRows.map((r) => ({
        id: r.id,
        agencyId: r.agencyId,
        agencyName: r.agencyName,
        movementType: r.movementType,
        amount: parseFloat(r.amount as string),
        balanceAfter: parseFloat(r.balanceAfter as string),
        reference: r.reference,
        description: r.description,
        createdAt: r.createdAt,
      })),
      nextCursor,
      hasMore,
    }
  } catch (err) {
    logger.error("loadFinanceMovements failed", {
      err: err instanceof Error ? err.message : String(err),
    })
    return empty
  }
}

/* -------------------------------------------------------------------------- */
/* Demandes de recharge                                                          */
/* -------------------------------------------------------------------------- */

export type RechargeRequestsOpts = {
  status?: "pending" | "validated" | "rejected" | null
  agencyId?: string | null
  limit?: number
}

export async function loadRechargeRequests(
  opts: RechargeRequestsOpts = {},
): Promise<RechargeRequestRow[]> {
  if (!process.env.DATABASE_URL) return []

  const limit = opts.limit ?? 100
  const db = getDb()

  try {
    const conditions = [
      opts.status ? eq(walletRechargeRequests.status, opts.status) : undefined,
      opts.agencyId
        ? eq(walletRechargeRequests.agencyId, opts.agencyId)
        : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined)

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await db
      .select({
        id: walletRechargeRequests.id,
        agencyId: walletRechargeRequests.agencyId,
        agencyName: sql<string>`COALESCE(${agencies.brandName}, ${agencies.name}, '')`,
        amount: walletRechargeRequests.amount,
        method: walletRechargeRequests.method,
        paymentReference: walletRechargeRequests.paymentReference,
        note: walletRechargeRequests.note,
        status: walletRechargeRequests.status,
        proofUrl: walletRechargeRequests.proofUrl,
        createdAt: walletRechargeRequests.createdAt,
        reviewedAt: walletRechargeRequests.reviewedAt,
      })
      .from(walletRechargeRequests)
      .leftJoin(agencies, eq(agencies.id, walletRechargeRequests.agencyId))
      .where(where)
      .orderBy(desc(walletRechargeRequests.createdAt))
      .limit(limit)

    return rows.map((r) => ({
      id: r.id,
      agencyId: r.agencyId,
      agencyName: r.agencyName,
      amount: parseFloat(r.amount as string),
      method: r.method,
      paymentReference: r.paymentReference,
      note: r.note,
      status: r.status,
      proofUrl: r.proofUrl,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
    }))
  } catch (err) {
    logger.error("loadRechargeRequests failed", {
      err: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
