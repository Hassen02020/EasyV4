"use server"

/**
 * Server actions du back-office Easy2Book.
 *
 * Périmètre PR #3 :
 *  - `updateReservationStatus` : transition de statut atomique sur une
 *    réservation, avec validation de la transition (state machine simple),
 *    log dans `audit_events` et `revalidatePath`.
 *
 * Les actions exigent une session Supabase valide (le middleware bloque
 * déjà `/admin/*` aux anonymes, on re-vérifie ici pour les server actions
 * appelées en POST direct).
 */

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations, reservationHotel, auditEvents } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { sendBroadcast } from "@/lib/supabase/broadcast"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getMyGoClient } from "@/lib/mygo"
import {
  classifyMyGoBookingError,
  describeMyGoCancellationErrorForUser,
} from "@/lib/booking/hotel-provider-booking"
import {
  RESERVATION_STATUSES,
  isTransitionAllowed,
  type ReservationStatus,
} from "./reservation-status"

const inputSchema = z.object({
  reservationId: z.string().uuid(),
  nextStatus: z.enum(RESERVATION_STATUSES),
})

export type UpdateStatusInput = z.infer<typeof inputSchema>

export type UpdateStatusResult =
  | {
      ok: true
      reservationId: string
      previousStatus: ReservationStatus
      nextStatus: ReservationStatus
    }
  | { ok: false; error: string }

export async function updateReservationStatus(
  raw: UpdateStatusInput,
): Promise<UpdateStatusResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide" }
  }
  const { reservationId, nextStatus } = parsed.data

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: "Session expirée" }
  }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile?.agencyId) {
    return { ok: false, error: "Profil administrateur introuvable ou non lié à une agence" }
  }
  const agencyId = profile.agencyId

  const outcome = await withTenantContext(
    { agencyId, userId: user.id, isSuperAdmin: profile.role === "super_admin" },
    async (db) => {
      const current = await db
        .select({
          id: reservations.id,
          status: reservations.status,
          publicRef: reservations.publicRef,
          module: reservations.module,
        })
        .from(reservations)
        .where(
          and(
            eq(reservations.id, reservationId),
            eq(reservations.agencyId, agencyId),
          ),
        )
        .limit(1)

      const row = current[0]
      if (!row) {
        return { ok: false as const, error: "Réservation introuvable" }
      }

      const previousStatus = row.status as ReservationStatus
      if (!isTransitionAllowed(previousStatus, nextStatus)) {
        return {
          ok: false as const,
          error: `Transition interdite : ${previousStatus} → ${nextStatus}`,
        }
      }

      const cancelledAt = nextStatus === "cancelled" ? new Date() : null

      // --- Annulation fournisseur (myGo) AVANT la transition de statut ---
      // Si cette réservation hôtel a été réellement confirmée auprès de myGo
      // (providerBookingId présent), on annule côté fournisseur d'abord : on
      // ne veut pas marquer "cancelled" en interne pendant que l'hôtel
      // attend toujours le client.
      let providerCancellationFee: number | undefined
      if (nextStatus === "cancelled" && row.module === "hotel") {
        const [hotelRow] = await db
          .select({ providerBookingId: reservationHotel.providerBookingId })
          .from(reservationHotel)
          .where(
            and(
              eq(reservationHotel.reservationId, reservationId),
              eq(reservationHotel.agencyId, agencyId),
            ),
          )
          .limit(1)

        if (hotelRow?.providerBookingId) {
          try {
            const cancellation = await getMyGoClient().cancelBooking({
              bookingId: Number(hotelRow.providerBookingId),
            })
            providerCancellationFee = cancellation.fee
          } catch (err) {
            // Annulation retry-safe côté fournisseur (idempotente) : on ne
            // change PAS le statut local, l'admin peut relancer sans risque
            // — contrairement à la création, une annulation ré-essayée est
            // sans danger (no-op si déjà annulée côté myGo).
            const kind = classifyMyGoBookingError(err)
            return {
              ok: false as const,
              error: describeMyGoCancellationErrorForUser(kind),
            }
          }
        }
      }

      await db
        .update(reservations)
        .set({
          status: nextStatus,
          updatedAt: new Date(),
          ...(cancelledAt ? { cancelledAt } : {}),
        })
        .where(
          and(
            eq(reservations.id, reservationId),
            eq(reservations.agencyId, agencyId),
          ),
        )

      try {
        await db.insert(auditEvents).values({
          agencyId,
          actorUserId: user.id,
          entityType: "reservation",
          entityId: reservationId,
          action: "status_update",
          diff: {
            publicRef: row.publicRef,
            from: previousStatus,
            to: nextStatus,
            ...(providerCancellationFee != null
              ? { providerCancellationFeeTnd: providerCancellationFee }
              : {}),
          },
        })
      } catch {
        /* audit best-effort, on n'échoue pas la mutation pour ça */
      }

      return { ok: true as const, row, previousStatus }
    },
  )

  if (!outcome.ok) {
    return { ok: false, error: outcome.error }
  }
  const { row, previousStatus } = outcome

  revalidatePath("/admin/reservations")
  revalidatePath("/admin")
  revalidatePath(`/booking/confirmation/${row.publicRef}`)

  // Notifie en live la page publique /booking/confirmation/[ref] qui ne peut
  // pas souscrire à `postgres_changes` (RLS bloque anon). Broadcast contourne
  // RLS car c'est un simple bus de messages, pas une lecture de table.
  await sendBroadcast({
    topic: `reservation-${row.publicRef}`,
    event: "status_change",
    payload: {
      publicRef: row.publicRef,
      previousStatus,
      nextStatus,
      at: Date.now(),
    },
  })

  return {
    ok: true,
    reservationId,
    previousStatus,
    nextStatus,
  }
}
