"use server"

/**
 * Updates flight_bookings.status and keeps reservations.status in sync.
 * Pure mapping logic lives in flight-status-utils.ts (no server directive).
 */

import { eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations } from "@/lib/db/schema"
import { flightBookings } from "@/lib/db/schema/flights"
import type { DrizzleTransaction } from "@/lib/db/client"
import { mapFlightStatusToReservation } from "./flight-status-utils"
import type { FlightStatus } from "./flight-status-utils"

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
