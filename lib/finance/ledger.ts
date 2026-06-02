/**
 * Financial Ledger Controller — Easy2Book
 *
 * Toutes les opérations sur le solde d'une agence B2B passent par ce module.
 * Chaque mouvement (crédit / débit / ajustement) est inscrit dans
 * `partner_credit_movements` AVANT la mise à jour d'`agencies.deposit_balance`.
 *
 * Principe de sécurité : SELECT ... FOR UPDATE (verrouillage pessimiste)
 * → aucune race condition possible sur le solde.
 */

import { eq, desc, and, gte, lte, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { agencies, partnerCreditMovements } from "@/lib/db/schema"
import type { NewPartnerCreditMovement } from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Helpers TND (numeric 12,3)                                                 */
/* -------------------------------------------------------------------------- */

function parseTnd(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "number" ? v : parseFloat(v)
  return isNaN(n) ? 0 : n
}

function formatTnd(v: number): string {
  return v.toFixed(3)
}

/* -------------------------------------------------------------------------- */
/* Return types                                                                */
/* -------------------------------------------------------------------------- */

export type LedgerResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; code: string; message: string }

export interface BalanceSummary {
  agencyId: string
  agencyName: string
  balance: number
  creditLowThreshold: number
  isLow: boolean
  currency: "TND"
}

export interface MovementRow {
  id: string
  movementType: "credit" | "debit" | "refund" | "adjustment"
  amount: number
  balanceAfter: number
  reference: string | null
  description: string | null
  createdAt: string
}

/* -------------------------------------------------------------------------- */
/* getAgencyBalance                                                            */
/* -------------------------------------------------------------------------- */

export async function getAgencyBalance(
  agencyId: string,
): Promise<LedgerResult<BalanceSummary>> {
  try {
    const db = getDb()
    const rows = await db
      .select({
        id: agencies.id,
        name: agencies.name,
        depositBalance: agencies.depositBalance,
        creditLowThreshold: agencies.creditLowThreshold,
      })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1)

    const row = rows[0]
    if (!row) return { ok: false, code: "NOT_FOUND", message: "Agence introuvable." }

    const balance = parseTnd(row.depositBalance)
    const threshold = parseTnd(row.creditLowThreshold)

    return {
      ok: true,
      data: {
        agencyId: row.id,
        agencyName: row.name,
        balance,
        creditLowThreshold: threshold,
        isLow: balance <= threshold,
        currency: "TND",
      },
    } as LedgerResult<BalanceSummary>
  } catch (err) {
    console.error("[ledger.getAgencyBalance]", err)
    return { ok: false, code: "DB_ERROR", message: "Erreur base de données." }
  }
}

/* -------------------------------------------------------------------------- */
/* creditAgency — recharge le solde (ex: virement reçu)                      */
/* -------------------------------------------------------------------------- */

export async function creditAgency(input: {
  agencyId: string
  amountTnd: number
  description?: string
  reference?: string
  createdByUserId?: string
}): Promise<LedgerResult<{ movementId: string; balanceAfter: number }>> {
  if (input.amountTnd <= 0) {
    return { ok: false, code: "INVALID_AMOUNT", message: "Le montant doit être positif." }
  }

  try {
    const db = getDb()

    return await db.transaction(async (tx) => {
      const locked = await tx
        .select({ id: agencies.id, depositBalance: agencies.depositBalance })
        .from(agencies)
        .where(eq(agencies.id, input.agencyId))
        .for("update")

      const agency = locked[0]
      if (!agency) return { ok: false, code: "NOT_FOUND", message: "Agence introuvable." }

      const newBalance = parseTnd(agency.depositBalance) + input.amountTnd

      const movement: NewPartnerCreditMovement = {
        agencyId: input.agencyId,
        movementType: "credit",
        amount: formatTnd(input.amountTnd),
        balanceAfter: formatTnd(newBalance),
        description: input.description ?? "Recharge solde",
        reference: input.reference ?? null,
        createdByUserId: input.createdByUserId ?? null,
      }

      const [{ id: movementId }] = await tx
        .insert(partnerCreditMovements)
        .values(movement)
        .returning({ id: partnerCreditMovements.id })

      await tx
        .update(agencies)
        .set({ depositBalance: formatTnd(newBalance) })
        .where(eq(agencies.id, input.agencyId))

      return { ok: true, data: { movementId, balanceAfter: newBalance } } as LedgerResult<{ movementId: string; balanceAfter: number }>
    })
  } catch (err) {
    console.error("[ledger.creditAgency]", err)
    return { ok: false, code: "DB_ERROR", message: "Erreur base de données." }
  }
}

/* -------------------------------------------------------------------------- */
/* debitAgency — débite le solde (ex: réservation confirmée)                 */
/* -------------------------------------------------------------------------- */

export async function debitAgency(input: {
  agencyId: string
  amountTnd: number
  description?: string
  reference?: string
  reservationId?: string
  createdByUserId?: string
}): Promise<LedgerResult<{ movementId: string; balanceBefore: number; balanceAfter: number }>> {
  if (input.amountTnd <= 0) {
    return { ok: false, code: "INVALID_AMOUNT", message: "Le montant doit être positif." }
  }

  try {
    const db = getDb()

    return await db.transaction(async (tx) => {
      const locked = await tx
        .select({ id: agencies.id, depositBalance: agencies.depositBalance })
        .from(agencies)
        .where(eq(agencies.id, input.agencyId))
        .for("update")

      const agency = locked[0]
      if (!agency) return { ok: false, code: "NOT_FOUND", message: "Agence introuvable." }

      const balanceBefore = parseTnd(agency.depositBalance)
      if (balanceBefore < input.amountTnd) {
        return { ok: false, code: "INSUFFICIENT_FUNDS", message: "Solde insuffisant." }
      }

      const balanceAfter = balanceBefore - input.amountTnd

      const movement: NewPartnerCreditMovement = {
        agencyId: input.agencyId,
        movementType: "debit",
        amount: formatTnd(-input.amountTnd),
        balanceAfter: formatTnd(balanceAfter),
        description: input.description ?? "Débit réservation",
        reference: input.reference ?? null,
        reservationId: input.reservationId ?? null,
        createdByUserId: input.createdByUserId ?? null,
      }

      const [{ id: movementId }] = await tx
        .insert(partnerCreditMovements)
        .values(movement)
        .returning({ id: partnerCreditMovements.id })

      await tx
        .update(agencies)
        .set({ depositBalance: formatTnd(balanceAfter) })
        .where(eq(agencies.id, input.agencyId))

      return { ok: true, data: { movementId, balanceBefore, balanceAfter } } as LedgerResult<{ movementId: string; balanceBefore: number; balanceAfter: number }>
    })
  } catch (err) {
    console.error("[ledger.debitAgency]", err)
    return { ok: false, code: "DB_ERROR", message: "Erreur base de données." }
  }
}

/* -------------------------------------------------------------------------- */
/* getMovements — historique paginé                                           */
/* -------------------------------------------------------------------------- */

export async function getMovements(input: {
  agencyId: string
  limit?: number
  offset?: number
  from?: Date
  to?: Date
}): Promise<LedgerResult<{ movements: MovementRow[]; total: number }>> {
  try {
    const db = getDb()
    const limit = input.limit ?? 20
    const offset = input.offset ?? 0

    const conditions = [eq(partnerCreditMovements.agencyId, input.agencyId)]
    if (input.from) conditions.push(gte(partnerCreditMovements.createdAt, input.from))
    if (input.to) conditions.push(lte(partnerCreditMovements.createdAt, input.to))

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(partnerCreditMovements)
        .where(and(...conditions))
        .orderBy(desc(partnerCreditMovements.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(partnerCreditMovements)
        .where(and(...conditions)),
    ])

    const movements: MovementRow[] = rows.map((r) => ({
      id: r.id,
      movementType: r.movementType as MovementRow["movementType"],
      amount: parseTnd(r.amount),
      balanceAfter: parseTnd(r.balanceAfter),
      reference: r.reference ?? null,
      description: r.description ?? null,
      createdAt: r.createdAt.toISOString(),
    }))

    return {
      ok: true,
      data: { movements, total: countRows[0]?.count ?? 0 },
    } as LedgerResult<{ movements: MovementRow[]; total: number }>
  } catch (err) {
    console.error("[ledger.getMovements]", err)
    return { ok: false, code: "DB_ERROR", message: "Erreur base de données." }
  }
}
