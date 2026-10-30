/**
 * B2C-CLIENTS-SEARCH-01 (écart G-54) — liste et statistiques des clients
 * B2C de /admin/b2c/clients.
 *
 * Avant : le champ « Rechercher un client… » n'était relié à rien, et les
 * trois statistiques étaient calculées sur les 100 premières lignes
 * affichées seulement (faux dès 101 clients). Désormais : recherche serveur
 * (prénom, nom, prénom + nom, email, téléphone), statistiques calculées en
 * SQL sur TOUTE la base clients de l'agence.
 *
 * Pas de `server-only` : testé en live contre Postgres (app_runtime).
 */

import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { customers, reservations } from "@/lib/db/schema"

export const B2C_CLIENTS_PAGE_SIZE = 100

/** Échappe %, _ et \ pour un motif ILIKE littéral. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export function normalizeClientQuery(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 100) : ""
}

export async function listB2cClientsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; q: string },
) {
  const q = normalizeClientQuery(params.q)
  const pattern = likePattern(q)
  const phoneDigits = q.replace(/\D/g, "")

  const search = q
    ? or(
        ilike(customers.firstName, pattern),
        ilike(customers.lastName, pattern),
        ilike(customers.email, pattern),
        sql`(${customers.firstName} || ' ' || ${customers.lastName}) ilike ${pattern}`,
        phoneDigits.length >= 3
          ? sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') like ${`%${phoneDigits}%`}`
          : undefined,
      )
    : undefined

  const rows = await tx
    .select({
      id: customers.id,
      civility: customers.civility,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      civicId: customers.civicId,
      country: customers.country,
      city: customers.city,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(eq(customers.agencyId, params.agencyId), search))
    .orderBy(desc(customers.createdAt))
    .limit(B2C_CLIENTS_PAGE_SIZE)

  const counts = await tx
    .select({
      customerId: reservations.customerId,
      count: count(reservations.id),
    })
    .from(reservations)
    .where(eq(reservations.agencyId, params.agencyId))
    .groupBy(reservations.customerId)
  const byCustomer = new Map(counts.map((r) => [r.customerId, r.count]))

  return rows.map((c) => ({
    ...c,
    reservationCount: byCustomer.get(c.id) ?? 0,
  }))
}

/** Statistiques sur toute la base clients de l'agence (pas sur la page). */
export async function b2cClientStatsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; now?: Date },
) {
  const now = params.now ?? new Date()
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )

  const [totals] = await tx
    .select({
      total: count(customers.id),
      newThisMonth: sql<number>`count(*) filter (where ${gte(customers.createdAt, monthStart)})`,
    })
    .from(customers)
    .where(eq(customers.agencyId, params.agencyId))

  const [withRes] = await tx
    .select({
      n: sql<number>`count(distinct ${reservations.customerId})`,
    })
    .from(reservations)
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .where(
      and(
        eq(reservations.agencyId, params.agencyId),
        eq(customers.agencyId, params.agencyId),
      ),
    )

  return {
    total: Number(totals?.total ?? 0),
    withReservations: Number(withRes?.n ?? 0),
    newThisMonth: Number(totals?.newThisMonth ?? 0),
  }
}
