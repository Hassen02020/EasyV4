/**
 * Data layer — Réservations Omra (back-office)
 *
 * Chargement des listes filtrées/triées/paginées, du détail d'une réservation
 * (infos + pèlerins + historique) et des KPIs Omra pour le dashboard.
 *
 * Toutes les requêtes sont scopées par `agencyId`.
 */

import "server-only"
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
  count,
  type SQL,
} from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import {
  reservations,
  reservationOmra,
  customers,
  omraPackages,
  omraPilgrims,
  omraAllotments,
  auditEvents,
} from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type OmraReservationStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"

export type OmraReservationSort =
  | "created_desc"
  | "created_asc"
  | "departure_desc"
  | "departure_asc"
  | "amount_desc"
  | "amount_asc"
  | "ref_asc"

export interface OmraReservationFilters {
  status?: string
  search?: string
  packageId?: string
  departureFrom?: string
  departureTo?: string
  createdFrom?: string
  createdTo?: string
  sort?: OmraReservationSort
  page?: number
  pageSize?: number
}

export interface OmraReservationRow {
  id: string
  publicRef: string
  status: string
  createdAt: Date
  tndAmount: number
  depositPaid: number
  departureDate: string | null
  returnDate: string | null
  pilgrims: number
  packageName: string | null
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
}

export interface OmraReservationsPage {
  rows: OmraReservationRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export const OMRA_RESERVATION_PAGE_SIZE = 20

/* -------------------------------------------------------------------------- */
/* Liste                                                                      */
/* -------------------------------------------------------------------------- */

const VALID_STATUSES = new Set<OmraReservationStatus>([
  "pending",
  "confirmed",
  "cancelled",
  "completed",
])

function orderByClause(sort: OmraReservationSort | undefined): SQL[] {
  switch (sort) {
    case "created_asc":
      return [asc(reservations.createdAt)]
    case "departure_desc":
      return [desc(reservationOmra.departureDate), desc(reservations.createdAt)]
    case "departure_asc":
      return [asc(reservationOmra.departureDate), desc(reservations.createdAt)]
    case "amount_desc":
      return [desc(reservations.tndAmount)]
    case "amount_asc":
      return [asc(reservations.tndAmount)]
    case "ref_asc":
      return [asc(reservations.publicRef)]
    case "created_desc":
    default:
      return [desc(reservations.createdAt)]
  }
}

export async function loadOmraReservationsPage(
  agencyId: string,
  filters: OmraReservationFilters = {},
): Promise<OmraReservationsPage> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = filters.pageSize ?? OMRA_RESERVATION_PAGE_SIZE

  const empty: OmraReservationsPage = {
    rows: [],
    total: 0,
    page,
    pageSize,
    pageCount: 0,
  }

  if (!process.env.DATABASE_URL) return empty

  try {
    const db = getDb()

    const conditions: SQL[] = [
      eq(reservations.agencyId, agencyId),
      eq(reservations.module, "omra"),
    ]

    if (filters.status && VALID_STATUSES.has(filters.status as OmraReservationStatus)) {
      conditions.push(
        eq(reservations.status, filters.status as OmraReservationStatus),
      )
    }

    if (filters.packageId) {
      conditions.push(eq(reservationOmra.omraPackageId, filters.packageId))
    }

    if (filters.departureFrom) {
      conditions.push(gte(reservationOmra.departureDate, filters.departureFrom))
    }
    if (filters.departureTo) {
      conditions.push(lte(reservationOmra.departureDate, filters.departureTo))
    }

    if (filters.createdFrom) {
      conditions.push(
        gte(reservations.createdAt, new Date(filters.createdFrom)),
      )
    }
    if (filters.createdTo) {
      // Inclure toute la journée de fin.
      const end = new Date(filters.createdTo)
      end.setHours(23, 59, 59, 999)
      conditions.push(lte(reservations.createdAt, end))
    }

    const search = filters.search?.trim()
    if (search) {
      const like = `%${search}%`
      const searchCond = or(
        ilike(reservations.publicRef, like),
        ilike(customers.firstName, like),
        ilike(customers.lastName, like),
        ilike(customers.email, like),
        ilike(customers.phone, like),
        ilike(omraPackages.name, like),
        sql`(${customers.firstName} || ' ' || ${customers.lastName}) ILIKE ${like}`,
      )
      if (searchCond) conditions.push(searchCond)
    }

    const whereClause = and(...conditions)

    const [{ value: total } = { value: 0 }] = await db
      .select({ value: count() })
      .from(reservations)
      .leftJoin(
        reservationOmra,
        eq(reservationOmra.reservationId, reservations.id),
      )
      .leftJoin(customers, eq(customers.id, reservations.customerId))
      .leftJoin(omraPackages, eq(omraPackages.id, reservationOmra.omraPackageId))
      .where(whereClause)

    const rowsRaw = await db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        status: reservations.status,
        createdAt: reservations.createdAt,
        tndAmount: reservations.tndAmount,
        depositPaid: reservations.depositPaid,
        departureDate: reservationOmra.departureDate,
        returnDate: reservationOmra.returnDate,
        pilgrims: reservationOmra.pilgrims,
        packageName: omraPackages.name,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerPhone: customers.phone,
        customerEmail: customers.email,
      })
      .from(reservations)
      .leftJoin(
        reservationOmra,
        eq(reservationOmra.reservationId, reservations.id),
      )
      .leftJoin(customers, eq(customers.id, reservations.customerId))
      .leftJoin(omraPackages, eq(omraPackages.id, reservationOmra.omraPackageId))
      .where(whereClause)
      .orderBy(...orderByClause(filters.sort))
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    const rows: OmraReservationRow[] = rowsRaw.map((r) => ({
      id: r.id,
      publicRef: r.publicRef,
      status: r.status,
      createdAt: r.createdAt,
      tndAmount: parseFloat(r.tndAmount as string) || 0,
      depositPaid: parseFloat((r.depositPaid as string) ?? "0") || 0,
      departureDate: r.departureDate ?? null,
      returnDate: r.returnDate ?? null,
      pilgrims: r.pilgrims ?? 0,
      packageName: r.packageName ?? null,
      customerName:
        `${r.customerFirstName ?? ""} ${r.customerLastName ?? ""}`.trim() || "—",
      customerPhone: r.customerPhone ?? null,
      customerEmail: r.customerEmail ?? null,
    }))

    return {
      rows,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    }
  } catch (error) {
    console.error("[loadOmraReservationsPage]", error)
    return empty
  }
}

/* -------------------------------------------------------------------------- */
/* Détail                                                                     */
/* -------------------------------------------------------------------------- */

export interface OmraReservationPilgrim {
  id: string
  firstName: string
  lastName: string
  gender: string
  nationality: string
  passportNumber: string
  passportExpiryDate: string
  visaStatus: string
  birthDate: string
  phone: string
}

export interface OmraReservationHistoryEntry {
  id: string
  action: string
  actorUserId: string | null
  createdAt: Date
  diff: Record<string, unknown> | null
}

export interface OmraReservationDetail {
  id: string
  publicRef: string
  status: string
  createdAt: Date
  confirmedAt: Date | null
  cancelledAt: Date | null
  tndAmount: number
  depositAmount: number
  depositPaid: number
  notes: string | null
  departureDate: string | null
  returnDate: string | null
  pilgrimCount: number
  packageId: string | null
  packageName: string | null
  packageSlug: string | null
  customer: {
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
  }
  pilgrims: OmraReservationPilgrim[]
  history: OmraReservationHistoryEntry[]
}

export async function loadOmraReservationDetail(
  agencyId: string,
  id: string,
): Promise<OmraReservationDetail | null> {
  if (!process.env.DATABASE_URL) return null

  try {
    const db = getDb()

    const [row] = await db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        status: reservations.status,
        createdAt: reservations.createdAt,
        confirmedAt: reservations.confirmedAt,
        cancelledAt: reservations.cancelledAt,
        tndAmount: reservations.tndAmount,
        depositAmount: reservations.depositAmount,
        depositPaid: reservations.depositPaid,
        notes: reservations.notes,
        module: reservations.module,
        departureDate: reservationOmra.departureDate,
        returnDate: reservationOmra.returnDate,
        pilgrimCount: reservationOmra.pilgrims,
        packageId: omraPackages.id,
        packageName: omraPackages.name,
        packageSlug: omraPackages.slug,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(reservations)
      .leftJoin(
        reservationOmra,
        eq(reservationOmra.reservationId, reservations.id),
      )
      .leftJoin(customers, eq(customers.id, reservations.customerId))
      .leftJoin(omraPackages, eq(omraPackages.id, reservationOmra.omraPackageId))
      .where(
        and(
          eq(reservations.id, id),
          eq(reservations.agencyId, agencyId),
          eq(reservations.module, "omra"),
        ),
      )
      .limit(1)

    if (!row) return null

    const pilgrimRows = await db
      .select({
        id: omraPilgrims.id,
        firstName: omraPilgrims.firstName,
        lastName: omraPilgrims.lastName,
        gender: omraPilgrims.gender,
        nationality: omraPilgrims.nationality,
        passportNumber: omraPilgrims.passportNumber,
        passportExpiryDate: omraPilgrims.passportExpiryDate,
        visaStatus: omraPilgrims.visaStatus,
        birthDate: omraPilgrims.birthDate,
        phone: omraPilgrims.phone,
      })
      .from(omraPilgrims)
      .where(
        and(
          eq(omraPilgrims.reservationId, id),
          eq(omraPilgrims.agencyId, agencyId),
        ),
      )
      .orderBy(asc(omraPilgrims.createdAt))

    const historyRows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        actorUserId: auditEvents.actorUserId,
        createdAt: auditEvents.createdAt,
        diff: auditEvents.diff,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.agencyId, agencyId),
          eq(auditEvents.entityType, "reservation"),
          eq(auditEvents.entityId, id),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))

    return {
      id: row.id,
      publicRef: row.publicRef,
      status: row.status,
      createdAt: row.createdAt,
      confirmedAt: row.confirmedAt ?? null,
      cancelledAt: row.cancelledAt ?? null,
      tndAmount: parseFloat(row.tndAmount as string) || 0,
      depositAmount: parseFloat((row.depositAmount as string) ?? "0") || 0,
      depositPaid: parseFloat((row.depositPaid as string) ?? "0") || 0,
      notes: row.notes ?? null,
      departureDate: row.departureDate ?? null,
      returnDate: row.returnDate ?? null,
      pilgrimCount: row.pilgrimCount ?? 0,
      packageId: row.packageId ?? null,
      packageName: row.packageName ?? null,
      packageSlug: row.packageSlug ?? null,
      customer: {
        firstName: row.customerFirstName ?? "—",
        lastName: row.customerLastName ?? "",
        email: row.customerEmail ?? null,
        phone: row.customerPhone ?? null,
      },
      pilgrims: pilgrimRows.map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        gender: p.gender,
        nationality: p.nationality,
        passportNumber: p.passportNumber,
        passportExpiryDate: p.passportExpiryDate,
        visaStatus: p.visaStatus,
        birthDate: p.birthDate,
        phone: p.phone,
      })),
      history: historyRows.map((h) => ({
        id: h.id,
        action: h.action,
        actorUserId: h.actorUserId ?? null,
        createdAt: h.createdAt,
        diff: (h.diff as Record<string, unknown> | null) ?? null,
      })),
    }
  } catch (error) {
    console.error("[loadOmraReservationDetail]", error)
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Programmes (pour le filtre)                                                */
/* -------------------------------------------------------------------------- */

export async function loadOmraPackageOptions(
  agencyId: string,
): Promise<{ id: string; name: string }[]> {
  if (!process.env.DATABASE_URL) return []
  try {
    const db = getDb()
    return await db
      .select({ id: omraPackages.id, name: omraPackages.name })
      .from(omraPackages)
      .where(eq(omraPackages.agencyId, agencyId))
      .orderBy(asc(omraPackages.name))
  } catch (error) {
    console.error("[loadOmraPackageOptions]", error)
    return []
  }
}

/* -------------------------------------------------------------------------- */
/* Badge back-office (réservations à traiter)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Nombre de réservations Omra en attente de traitement (statut `pending`).
 * Alimente le badge compteur du back-office — se met à jour automatiquement
 * quand une réservation est confirmée ou annulée.
 */
export async function countPendingOmraReservations(
  agencyId: string,
): Promise<number> {
  if (!process.env.DATABASE_URL) return 0
  try {
    const db = getDb()
    const [{ value } = { value: 0 }] = await db
      .select({ value: count() })
      .from(reservations)
      .where(
        and(
          eq(reservations.agencyId, agencyId),
          eq(reservations.module, "omra"),
          eq(reservations.status, "pending"),
        ),
      )
    return value
  } catch (error) {
    console.error("[countPendingOmraReservations]", error)
    return 0
  }
}

/* -------------------------------------------------------------------------- */
/* KPIs dashboard                                                             */
/* -------------------------------------------------------------------------- */

export interface OmraKpis {
  reservationsToday: number
  pending: number
  confirmed: number
  revenueConfirmed: number
  conversionRate: number
  seatsRemaining: number
}

export async function loadOmraKpis(agencyId: string): Promise<OmraKpis> {
  const empty: OmraKpis = {
    reservationsToday: 0,
    pending: 0,
    confirmed: 0,
    revenueConfirmed: 0,
    conversionRate: 0,
    seatsRemaining: 0,
  }
  if (!process.env.DATABASE_URL) return empty

  try {
    const db = getDb()

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const [agg] = await db
      .select({
        total: count(),
        today: sql<number>`COUNT(*) FILTER (WHERE ${reservations.createdAt} >= ${startOfDay.toISOString()})`,
        pending: sql<number>`COUNT(*) FILTER (WHERE ${reservations.status} = 'pending')`,
        confirmed: sql<number>`COUNT(*) FILTER (WHERE ${reservations.status} = 'confirmed')`,
        completed: sql<number>`COUNT(*) FILTER (WHERE ${reservations.status} = 'completed')`,
        revenue: sql<string>`COALESCE(SUM(${reservations.tndAmount}) FILTER (WHERE ${reservations.status} IN ('confirmed','completed')), 0)`,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.agencyId, agencyId),
          eq(reservations.module, "omra"),
        ),
      )

    const [seats] = await db
      .select({
        remaining: sql<string>`COALESCE(SUM(${omraAllotments.availableCount}), 0)`,
      })
      .from(omraAllotments)
      .innerJoin(omraPackages, eq(omraPackages.id, omraAllotments.packageId))
      .where(
        and(
          eq(omraPackages.agencyId, agencyId),
          eq(omraAllotments.status, "active"),
        ),
      )

    const total = Number(agg?.total ?? 0)
    const confirmed = Number(agg?.confirmed ?? 0)
    const completed = Number(agg?.completed ?? 0)
    const won = confirmed + completed

    return {
      reservationsToday: Number(agg?.today ?? 0),
      pending: Number(agg?.pending ?? 0),
      confirmed,
      revenueConfirmed: Number(agg?.revenue ?? 0),
      conversionRate: total > 0 ? Math.round((won / total) * 100) : 0,
      seatsRemaining: Number(seats?.remaining ?? 0),
    }
  } catch (error) {
    console.error("[loadOmraKpis]", error)
    return empty
  }
}
