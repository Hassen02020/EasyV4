/**
 * Dashboard partenaire B2B — indicateurs réels via Drizzle.
 *
 * Toutes les agrégations sont scoped sur `agencyId`.
 * Période glissante 30 jours par défaut.
 */

import { and, eq, gte, sql, count } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { reservations, agencies } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

/* -------------------------------------------------------------------------- */
/* Types                                                                        */
/* -------------------------------------------------------------------------- */

export type PartnerDashboardStats = {
  /** Réservations créées dans les 30 derniers jours */
  reservationsLast30: number
  /** Montant TND total des réservations des 30 derniers jours */
  salesLast30Tnd: number
  /** Réservations en statut "pending" ou "on_request" */
  pendingCount: number
  /** Solde wallet actuel (TND) */
  walletBalance: number
}

/* -------------------------------------------------------------------------- */
/* Requête                                                                      */
/* -------------------------------------------------------------------------- */

export async function loadPartnerDashboard(
  agencyId: string,
): Promise<PartnerDashboardStats> {
  const empty: PartnerDashboardStats = {
    reservationsLast30: 0,
    salesLast30Tnd: 0,
    pendingCount: 0,
    walletBalance: 0,
  }

  if (!process.env.DATABASE_URL) return empty

  const db = getDb()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  try {
    const [statsRows, pendingRows, agencyRow] = await Promise.all([
      db
        .select({
          cnt: count(reservations.id),
          sumTnd: sql<string>`COALESCE(SUM(${reservations.tndAmount}::numeric), 0)`,
        })
        .from(reservations)
        .where(
          and(
            eq(reservations.agencyId, agencyId),
            gte(reservations.createdAt, since),
          ),
        ),

      db
        .select({ cnt: count(reservations.id) })
        .from(reservations)
        .where(
          and(
            eq(reservations.agencyId, agencyId),
            sql`${reservations.status} IN ('pending','on_request')`,
          ),
        ),

      db
        .select({ depositBalance: agencies.depositBalance })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1),
    ])

    const stats = statsRows[0]
    const pending = pendingRows[0]
    const agency = agencyRow[0]

    return {
      reservationsLast30: stats?.cnt ?? 0,
      salesLast30Tnd: parseFloat(stats?.sumTnd ?? "0") || 0,
      pendingCount: pending?.cnt ?? 0,
      walletBalance: parseFloat(agency?.depositBalance as string) || 0,
    }
  } catch (err) {
    logger.error("[loadPartnerDashboard] failed", {
      agencyId,
      err: err instanceof Error ? err.message : String(err),
    })
    return empty
  }
}
