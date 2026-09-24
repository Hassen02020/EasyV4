"use server"

/**
 * Maps the granular 8-state flight machine to the shared reservation_status.
 * Called whenever flight_bookings.status changes so the Booking Core stays
 * current for CRM, Finance, and Customer 360.
 *
 * Mapping rationale:
 *   PENDING / PRICE_RECHECK / PRICE_CHANGED → "pending"   (ops not yet confirmed)
 *   APPROVED / BOOKING_IN_PROGRESS / BOOKED /
 *   TICKETING_IN_PROGRESS                  → "on_request" (provider engaged)
 *   CONFIRMED                              → "confirmed"
 *   FAILED / CANCELLED                     → "cancelled"
 */

import { eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations } from "@/lib/db/schema"
import { flightBookings } from "@/lib/db/schema/flights"
import type { DrizzleTransaction } from "@/lib/db/client"

type FlightStatus =
  | "PENDING"
  | "PRICE_RECHECK"
  | "PRICE_CHANGED"
  | "APPROVED"
  | "BOOKING_IN_PROGRESS"
  | "BOOKED"
  | "TICKETING_IN_PROGRESS"
  | "CONFIRMED"
  | "FAILED"
  | "CANCELLED"

type ReservationStatus = "pending" | "on_request" | "confirmed" | "cancelled"

export function mapFlightStatusToReservation(status: FlightStatus): ReservationStatus {
  switch (status) {
    case "PENDING":
    case "PRICE_RECHECK":
    case "PRICE_CHANGED":
      return "pending"
    case "APPROVED":
    case "BOOKING_IN_PROGRESS":
    case "BOOKED":
    case "TICKETING_IN_PROGRESS":
      return "on_request"
    case "CONFIRMED":
      return "confirmed"
    case "FAILED":
    case "CANCELLED":
      return "cancelled"
  }
}

/**
 * Updates flight_bookings.status and keeps reservations.status in sync.
 * Pass an open tx to run atomically inside an existing transaction, or omit
 * to open a new system transaction.
 */
export async function updateFlightStatus(
  flightBookingId: string,
  newStatus: FlightStatus,
  tx?: DrizzleTransaction,
): Promise<void> {
  const run = async (db: DrizzleTransaction) => {
    await db
      .update(flightBookings)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(flightBookings.id, flightBookingId))

    const [row] = await db
      .select({ reservationId: flightBookings.reservationId })
      .from(flightBookings)
      .where(eq(flightBookings.id, flightBookingId))
      .limit(1)

    if (row?.reservationId) {
      const reservationStatus = mapFlightStatusToReservation(newStatus)
      await db
        .update(reservations)
        .set({
          status: reservationStatus,
          ...(newStatus === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
          ...(newStatus === "CANCELLED" ? { cancelledAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, row.reservationId))
    }
  }

  if (tx) {
    await run(tx)
  } else {
    await withSystemContext(run)
  }
}
