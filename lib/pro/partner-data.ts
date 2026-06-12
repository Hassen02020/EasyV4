/**
 * Loaders Drizzle pour les pages Pro (Frontoffice B2B) :
 *   - loadPartnerClients()   → annuaire clients finaux
 *   - loadPartnerLedger()    → relevé de compte (partnerCreditMovements)
 *   - loadPartnerPayments()  → demandes de recharge de l'agence
 */

import { and, desc, eq, ilike, or, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import {
  agencies,
  customers,
  partnerCreditMovements,
  reservations,
  walletRechargeRequests,
} from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import type {
  PartnerClient,
  PartnerLedgerEntry,
  PartnerPayment,
} from "@/lib/pro/mock-tables"

/* -------------------------------------------------------------------------- */
/* Clients                                                                      */
/* -------------------------------------------------------------------------- */

export type PartnerClientRow = PartnerClient

export async function loadPartnerClients(
  agencyId: string,
  search?: string,
): Promise<PartnerClient[]> {
  if (!process.env.DATABASE_URL) return []

  const db = getDb()

  try {
    const conditions = [eq(customers.agencyId, agencyId)]
    if (search?.trim()) {
      const q = `%${search.trim()}%`
      conditions.push(
        or(
          ilike(customers.firstName, q),
          ilike(customers.lastName, q),
          ilike(customers.email, q),
        )!,
      )
    }

    const rows = await db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phone: customers.phone,
        createdAt: customers.createdAt,
        bookings:
          sql<number>`CAST(COUNT(DISTINCT ${reservations.id}) AS INTEGER)`,
      })
      .from(customers)
      .leftJoin(
        reservations,
        and(
          eq(reservations.customerId, customers.id),
          eq(reservations.agencyId, agencyId),
        ),
      )
      .where(and(...conditions))
      .groupBy(customers.id)
      .orderBy(desc(customers.createdAt))
      .limit(200)

    return rows.map((r) => ({
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "—",
      email: r.email ?? "",
      phone: r.phone ?? undefined,
      reservationsCount: r.bookings,
      bookings: r.bookings,
      createdAt: r.createdAt.toISOString().slice(0, 10),
    }))
  } catch (err) {
    logger.error("loadPartnerClients failed", {
      agencyId,
      err: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/* -------------------------------------------------------------------------- */
/* Relevé de compte (ledger)                                                    */
/* -------------------------------------------------------------------------- */

export type PartnerLedgerRow = PartnerLedgerEntry

export type PartnerLedgerResult = {
  rows: PartnerLedgerEntry[]
  currentBalance: number
}

export async function loadPartnerLedger(
  agencyId: string,
  limit = 100,
): Promise<PartnerLedgerResult> {
  if (!process.env.DATABASE_URL)
    return { rows: [], currentBalance: 0 }

  const db = getDb()

  try {
    const [movements, balanceRow] = await Promise.all([
      db
        .select({
          id: partnerCreditMovements.id,
          movementType: partnerCreditMovements.movementType,
          amount: partnerCreditMovements.amount,
          balanceAfter: partnerCreditMovements.balanceAfter,
          description: partnerCreditMovements.description,
          reference: partnerCreditMovements.reference,
          createdAt: partnerCreditMovements.createdAt,
        })
        .from(partnerCreditMovements)
        .where(eq(partnerCreditMovements.agencyId, agencyId))
        .orderBy(desc(partnerCreditMovements.createdAt))
        .limit(limit),

      db
        .select({ balance: agencies.depositBalance })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1),
    ])

    const currentBalance = parseFloat(
      (balanceRow[0]?.balance as string | null) ?? "0",
    )

    const VALID_TYPES = new Set([
      "credit", "debit", "refund", "adjustment", "facture", "avoir", "payment",
    ])

    const rows: PartnerLedgerEntry[] = movements.map((m) => {
      const amount = parseFloat(m.amount as string)
      const isCredit = m.movementType === "credit" || m.movementType === "refund"
      const safeType = VALID_TYPES.has(m.movementType)
        ? (m.movementType as PartnerLedgerRow["type"])
        : undefined
      return {
        id: m.id,
        date: m.createdAt.toISOString().slice(0, 10),
        description:
          m.description ??
          (isCredit ? "Crédit wallet" : "Débit réservation"),
        type: safeType,
        debit: isCredit ? undefined : Math.abs(amount),
        credit: isCredit ? Math.abs(amount) : undefined,
        balance: parseFloat(m.balanceAfter as string),
        reference: m.reference,
      }
    })

    return { rows, currentBalance }
  } catch (err) {
    logger.error("loadPartnerLedger failed", {
      agencyId,
      err: err instanceof Error ? err.message : String(err),
    })
    return { rows: [], currentBalance: 0 }
  }
}

/* -------------------------------------------------------------------------- */
/* Paiements (recharge requests de l'agence)                                   */
/* -------------------------------------------------------------------------- */

export type PartnerPaymentRow = PartnerPayment

export async function loadPartnerPayments(
  agencyId: string,
): Promise<PartnerPayment[]> {
  if (!process.env.DATABASE_URL) return []

  const db = getDb()

  try {
    const rows = await db
      .select({
        id: walletRechargeRequests.id,
        amount: walletRechargeRequests.amount,
        method: walletRechargeRequests.method,
        paymentReference: walletRechargeRequests.paymentReference,
        status: walletRechargeRequests.status,
        note: walletRechargeRequests.note,
        proofUrl: walletRechargeRequests.proofUrl,
        createdAt: walletRechargeRequests.createdAt,
        reviewedAt: walletRechargeRequests.reviewedAt,
      })
      .from(walletRechargeRequests)
      .where(eq(walletRechargeRequests.agencyId, agencyId))
      .orderBy(desc(walletRechargeRequests.createdAt))
      .limit(100)

    return rows.map((r) => ({
      id: r.id,
      date: r.createdAt.toISOString().slice(0, 10),
      amount: parseFloat(r.amount as string),
      method: r.method,
      mode: r.method as "transfer" | "card" | "cash" | "check" | "credit_account",
      reference: r.paymentReference ?? undefined,
      status: r.status,
      note: r.note ?? undefined,
      proofUrl: r.proofUrl ?? undefined,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString().slice(0, 10) : undefined,
    }))
  } catch (err) {
    logger.error("loadPartnerPayments failed", {
      agencyId,
      err: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
