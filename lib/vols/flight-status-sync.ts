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
import {
  isTransitionAllowed,
  type ReservationStatus,
} from "@/lib/admin/reservation-status"
import { recordReservationTransition } from "@/lib/admin/reservation-status-history"
import { autoRefundOnFlightFailure } from "./flight-refund-on-failure"

/**
 * Updates flight_bookings.status and keeps reservations.status in sync.
 * Pass an open tx to run atomically inside an existing transaction, or omit
 * to open a new system transaction.
 *
 * FLIGHT-CANCELLED-REFUND-GUARD-01 : si newStatus === "CANCELLED" fait
 * réellement passer la réservation à "cancelled" (jamais aujourd'hui — aucun
 * appelant réel ne passe ce statut, voir flight-status-utils.ts), le
 * remboursement + reversement de commission (autoRefundOnFlightFailure, déjà
 * utilisé pour "FAILED" dans fulfillment-action.ts) se déclenche
 * automatiquement ici — jamais sauté silencieusement pour un futur appelant
 * (ex. webhook d'annulation GDS) qui oublierait de le câbler lui-même.
 * Uniquement quand `tx` n'est PAS fourni par l'appelant : dans ce cas la
 * transaction est gérée en interne (withSystemContext ci-dessous) et on sait
 * qu'elle a committé avant de déclencher le remboursement — même discipline
 * que fulfillment-action.ts (appel séparé, après commit, jamais imbriqué
 * dans la même transaction). Si un futur appelant passe un `tx` externe avec
 * "CANCELLED", le remboursement reste à sa charge, après son propre commit —
 * exactement comme fulfillment-action.ts le fait aujourd'hui pour "FAILED".
 */
export async function updateFlightStatus(
  flightBookingId: string,
  newStatus: FlightStatus,
  tx?: DrizzleTransaction,
): Promise<void> {
  const run = async (
    db: DrizzleTransaction,
  ): Promise<{ reservationId: string; agencyId: string } | null> => {
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
        .select({
          status: reservations.status,
          agencyId: reservations.agencyId,
        })
        .from(reservations)
        .where(eq(reservations.id, row.reservationId))
        .limit(1)
      const fromStatus = current?.status as ReservationStatus | undefined

      if (fromStatus && fromStatus !== reservationStatus) {
        if (!isTransitionAllowed(fromStatus, reservationStatus)) {
          return null
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

        if (newStatus === "CANCELLED" && current?.agencyId) {
          return {
            reservationId: row.reservationId,
            agencyId: current.agencyId,
          }
        }
      }
    }
    return null
  }

  if (tx) {
    await run(tx)
  } else {
    const pendingCancelRefund = await withSystemContext(run)
    if (pendingCancelRefund) {
      await autoRefundOnFlightFailure({
        reservationId: pendingCancelRefund.reservationId,
        agencyId: pendingCancelRefund.agencyId,
        actorUserId: null,
        reason: "Sync statut fournisseur vol : CANCELLED",
      })
    }
  }
}
