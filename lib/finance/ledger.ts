/**
 * Finance/Ledger — fonctions pour récupérer le solde et les mouvements
 * d'une agence B2B partenaire.
 */

import { eq, desc, count } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { agencies, partnerCreditMovements } from "@/lib/db/schema"

export type BalanceData = {
  balance: number
  threshold: number
  isLow: boolean
}

export type MovementRow = {
  id: string
  movementType: "credit" | "debit" | "refund" | "adjustment"
  amount: number
  balanceAfter: number
  reference: string | null
  description: string | null
  createdAt: string
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export async function getAgencyBalance(
  agencyId: string,
): Promise<Result<BalanceData>> {
  try {
    const db = getDb()
    const [agency] = await db
      .select({
        depositBalance: agencies.depositBalance,
        creditLowThreshold: agencies.creditLowThreshold,
      })
      .from(agencies)
      .where(eq(agencies.id, agencyId))

    if (!agency) {
      return { ok: false, error: "Agence introuvable" }
    }

    const balance = parseFloat(agency.depositBalance)
    const threshold = parseFloat(agency.creditLowThreshold)

    return {
      ok: true,
      data: { balance, threshold, isLow: balance <= threshold },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

export async function getMovements(opts: {
  agencyId: string
  limit?: number
  offset?: number
}): Promise<Result<{ movements: MovementRow[]; total: number }>> {
  try {
    const db = getDb()
    const limit = opts.limit ?? 20
    const offset = opts.offset ?? 0

    const [rows, totalResult] = await Promise.all([
      db
        .select()
        .from(partnerCreditMovements)
        .where(eq(partnerCreditMovements.agencyId, opts.agencyId))
        .orderBy(desc(partnerCreditMovements.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(partnerCreditMovements)
        .where(eq(partnerCreditMovements.agencyId, opts.agencyId)),
    ])

    const movements: MovementRow[] = rows.map((r) => ({
      id: r.id,
      movementType: r.movementType as MovementRow["movementType"],
      amount: parseFloat(r.amount),
      balanceAfter: parseFloat(r.balanceAfter),
      reference: r.reference,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
    }))

    return {
      ok: true,
      data: { movements, total: totalResult[0]?.count ?? 0 },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}
