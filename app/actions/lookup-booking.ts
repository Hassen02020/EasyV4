"use server"

import { eq, and, ilike } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { reservations, customers } from "@/lib/db/schema"

export type BookingLookupResult =
  | { ok: true; booking: BookingSummary }
  | { ok: false; error: string }

export type BookingStatus =
  | "pending"
  | "on_request"
  | "confirmed"
  | "cancelled"
  | "refunded"
  | "no_show"

export interface BookingSummary {
  id: string
  publicRef: string
  module: string
  status: BookingStatus
  originalAmount: string
  originalCurrency: string
  tndAmount: string
  createdAt: string
  confirmedAt: string | null
  cancelledAt: string | null
  customer: {
    firstName: string
    lastName: string
    email: string
    phone: string | null
  }
}

export async function lookupBooking(
  ref: string,
  email: string,
): Promise<BookingLookupResult> {
  const cleanRef = ref.trim().toUpperCase()
  const cleanEmail = email.trim().toLowerCase()

  if (!cleanRef || !cleanEmail) {
    return { ok: false, error: "Veuillez renseigner le code et l'email." }
  }

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Service temporairement indisponible." }
  }

  try {
    const db = getDb()

    const rows = await db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        originalAmount: reservations.originalAmount,
        originalCurrency: reservations.originalCurrency,
        tndAmount: reservations.tndAmount,
        createdAt: reservations.createdAt,
        confirmedAt: reservations.confirmedAt,
        cancelledAt: reservations.cancelledAt,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        phone: customers.phone,
      })
      .from(reservations)
      .innerJoin(customers, eq(reservations.customerId, customers.id))
      .where(
        and(
          eq(reservations.publicRef, cleanRef),
          ilike(customers.email, cleanEmail),
        ),
      )
      .limit(1)

    const row = rows[0]
    if (!row) {
      return {
        ok: false,
        error:
          "Aucune réservation trouvée avec ce code et cet email. Vérifiez vos informations.",
      }
    }

    return {
      ok: true,
      booking: {
        id: row.id,
        publicRef: row.publicRef,
        module: row.module,
        status: row.status as BookingStatus,
        originalAmount: row.originalAmount,
        originalCurrency: row.originalCurrency,
        tndAmount: row.tndAmount,
        createdAt: row.createdAt.toISOString(),
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
        customer: {
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email ?? "",
          phone: row.phone ?? null,
        },
      },
    }
  } catch (err) {
    console.error("[lookupBooking]", err)
    return { ok: false, error: "Erreur technique. Veuillez réessayer." }
  }
}
