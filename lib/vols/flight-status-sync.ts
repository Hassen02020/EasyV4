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
import { isTransitionAllowed, type ReservationStatus } from "@/lib/admin/reservation-status"
import { recordReservationTransition } from "@/lib/admin/reservation-status-history"

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

      // chantier-49A : ce sync fournisseur écrivait le statut sans jamais
      // connaître ni vérifier le statut précédent — un webhook/poll qui
      // renverrait un statut vol "en arrière" (ex. re-sync tardif après un
      // CONFIRMED déjà traité) pouvait faire régresser silencieusement une
      // réservation `confirmed` vers `pending`/`on_request`, statuts que la
      // state machine (lib/admin/reservation-status.ts) interdit pourtant
      // depuis `confirmed`. On lit le statut courant et on ignore l'update
      // (no-op, jamais une erreur qui ferait échouer tout le sync) si la
      // transition n'est pas légale — le cas `from === to` (statut déjà à
      // jour, le plus fréquent) est aussi un no-op silencieux.
      const [current] = await db
        .select({ status: reservations.status })
        .from(reservations)
        .where(eq(reservations.id, row.reservationId))
        .limit(1)
      const fromStatus = current?.status as ReservationStatus | undefined

      if (fromStatus && fromStatus !== reservationStatus) {
        if (!isTransitionAllowed(fromStatus, reservationStatus)) {
          return
        }
        await db
          .update(reservations)
          .set({
            status: reservationStatus,
            ...(newStatus === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
            ...(newStatus === "CANCELLED" ? { cancelledAt: new Date() } : {}),
            updatedAt: new Date(),
          })
          .where(eq(reservations.id, row.reservationId))

        await recordReservationTransition(db, {
          reservationId: row.reservationId,
          from: fromStatus,
          to: reservationStatus,
          automated: true,
          reason: `Sync statut fournisseur vol : ${newStatus}`,
        })
      }
    }
  }

  if (tx) {
    await run(tx)
  } else {
    await withSystemContext(run)
  }
}
