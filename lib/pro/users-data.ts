/**
 * Utilisateurs d'une agence partenaire — requête Drizzle.
 * Scoped sur agencyId, filtré sur rôles B2B uniquement.
 */

import { and, eq, inArray } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { users } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

/* -------------------------------------------------------------------------- */
/* Types                                                                        */
/* -------------------------------------------------------------------------- */

export type PartnerUserRow = {
  id: string
  email: string
  fullName: string
  role: "partner_owner" | "partner_agent"
  isActive: boolean
  lastLoginAt: string | null
}

/* -------------------------------------------------------------------------- */
/* Requête                                                                      */
/* -------------------------------------------------------------------------- */

export async function loadPartnerUsers(
  agencyId: string,
): Promise<PartnerUserRow[]> {
  if (!process.env.DATABASE_URL) return []

  const db = getDb()
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(
        and(
          eq(users.agencyId, agencyId),
          inArray(users.role, ["partner_owner", "partner_agent"]),
        ),
      )
      .orderBy(users.createdAt)

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.name ?? r.email.split("@")[0] ?? "—",
      role: r.role as "partner_owner" | "partner_agent",
      isActive: r.status === "active",
      lastLoginAt: r.lastLoginAt
        ? r.lastLoginAt.toLocaleString("fr-FR")
        : null,
    }))
  } catch (err) {
    logger.error("[loadPartnerUsers] failed", {
      agencyId,
      err: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
